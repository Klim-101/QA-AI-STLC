// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { noopLogger } from '../ports/logger.js';
import { systemClock } from '../ports/clock.js';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { runScope } from './scope.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

// Every type decided (P2-16 blocks `qa scope` while any is `undecided`); no type needs to be
// `in-scope` for these tests, so none of it needs a matching `api`/`source` config block.
const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: out-of-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments: {}',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

function fakeContext(files: Readonly<Record<string, string>> = {}): EngineContext {
  const configPath = join(QA_DIR, 'config.yaml');
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({ [configPath]: CONFIG_YAML, ...files }),
    clock: systemClock,
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

describe('runScope', () => {
  it('extracts requirements from a file and writes the scope artifact', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'docs', 'requirements.md')]: '## Login\nA user can log in.\n',
    });

    const result = await runScope(context, { from: 'file', path: 'docs/requirements.md' });

    expect(result).toEqual({ scopePath: 'artifacts/scope.json', added: 1, updated: 0, total: 1 });
    const scope = JSON.parse(await context.fs.readFile(join(QA_DIR, 'artifacts', 'scope.json'))) as {
      requirements: { id: string; source: unknown }[];
    };
    expect(scope.requirements[0]?.id).toBe('login');
    expect(scope.requirements[0]?.source).toEqual({ kind: 'file', path: 'docs/requirements.md' });
  });

  it('registers the scope artifact in the manifest', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'docs', 'requirements.md')]: '## Login\nbody\n',
    });

    await runScope(context, { from: 'file', path: 'docs/requirements.md' });

    const manifest = JSON.parse(await context.fs.readFile(join(QA_DIR, 'manifest.json'))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts).toHaveProperty('artifacts/scope.json');
  });

  it('extracts requirements from literal text', async () => {
    const context = fakeContext();

    const result = await runScope(context, {
      from: 'text',
      content: '## Signup\nA user can sign up.\n',
      label: 'operator input',
    });

    expect(result).toEqual({ scopePath: 'artifacts/scope.json', added: 1, updated: 0, total: 1 });
  });

  it('merges a second call by id instead of duplicating', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'docs', 'requirements.md')]: '## Login\nfirst version\n',
    });
    await runScope(context, { from: 'file', path: 'docs/requirements.md' });
    await context.fs.writeFile(join(PROJECT_ROOT, 'docs', 'requirements.md'), '## Login\nsecond version\n');

    const result = await runScope(context, { from: 'file', path: 'docs/requirements.md' });

    expect(result).toEqual({ scopePath: 'artifacts/scope.json', added: 0, updated: 1, total: 1 });
  });

  it('rejects an unknown --from value', async () => {
    const context = fakeContext();

    await expect(runScope(context, { from: 'screenshot' })).rejects.toThrow(QaError);
  });

  it('rejects --from file with no --path', async () => {
    const context = fakeContext();

    await expect(runScope(context, { from: 'file' })).rejects.toThrow(QaError);
  });

  it('rejects a --path that does not exist', async () => {
    const context = fakeContext();

    await expect(runScope(context, { from: 'file', path: 'docs/missing.md' })).rejects.toThrow(QaError);
  });

  it('rejects a --path outside the project', async () => {
    const context = fakeContext();

    await expect(runScope(context, { from: 'file', path: '../outside.md' })).rejects.toThrow(QaError);
  });

  it('rejects --from text with no --content or --label', async () => {
    const context = fakeContext();

    await expect(runScope(context, { from: 'text' })).rejects.toThrow(QaError);
    await expect(runScope(context, { from: 'text', content: 'x' })).rejects.toThrow(QaError);
  });

  it('rejects scoping while any testing type is still undecided (P2-16)', async () => {
    const undecidedYaml = CONFIG_YAML.replace('api: out-of-scope', 'api: undecided');
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: undecidedYaml });

    const error = await runScope(context, {
      from: 'text',
      content: '## Signup\nbody\n',
      label: 'operator input',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('SCOPE_TESTING_UNDECIDED');
    expect((error as QaError).message).toContain('api');
  });

  it('rejects scoping when there is no config.yaml at all', async () => {
    const context: EngineContext = {
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem(),
      clock: systemClock,
      logger: noopLogger,
      processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
      httpClient: createFakeHttpClient({ ok: true, status: 200 }),
      browserLauncher: createFakeBrowserLauncher(),
      env: {},
    };

    await expect(runScope(context, { from: 'text', content: 'x', label: 'x' })).rejects.toThrow(QaError);
  });
});
