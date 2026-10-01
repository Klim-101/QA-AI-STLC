// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError } from '../errors.js';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { runConfigSet } from './config-set.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

const BASE_CONFIG = [
  'schemaVersion: 1',
  '# A comment worth preserving.',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments: {}',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

function fakeContext(files: Readonly<Record<string, string>> = {}): EngineContext {
  return createFakeEngineContext({
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({ [join(QA_DIR, 'config.yaml')]: BASE_CONFIG, ...files }),
    env: {},
  });
}

describe('runConfigSet', () => {
  it('sets a testing type to in-scope and writes it back', async () => {
    const context = fakeContext();

    const result = await runConfigSet(context, { key: 'testing.a11y', value: 'in-scope' });

    expect(result).toEqual({ key: 'testing.a11y', value: 'in-scope' });
    const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as {
      testing: { a11y: string };
    };
    expect(written.testing.a11y).toBe('in-scope');
  });

  it('preserves comments and the rest of the file', async () => {
    const context = fakeContext();

    await runConfigSet(context, { key: 'testing.e2e', value: 'out-of-scope' });

    const raw = await context.fs.readFile(join(QA_DIR, 'config.yaml'));
    expect(raw).toContain('# A comment worth preserving.');
  });

  it('sets every supported testing.<type> key', async () => {
    for (const type of ['e2e', 'api', 'a11y', 'security']) {
      const context = fakeContext();
      await runConfigSet(context, { key: `testing.${type}`, value: 'out-of-scope' });
      const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as Record<
        string,
        Record<string, string>
      >;
      expect(written.testing?.[type]).toBe('out-of-scope');
    }
  });

  it.each(['none', 'kendo-jquery', 'kendo-angular'] as const)(
    'sets ui.componentLibrary to %s',
    async (library) => {
      const context = fakeContext();

      const result = await runConfigSet(context, { key: 'ui.componentLibrary', value: library });
      const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as {
        ui?: { componentLibrary?: string };
      };

      expect(result).toStrictEqual({ key: 'ui.componentLibrary', value: library });
      expect(written.ui?.componentLibrary).toBe(library);
    },
  );

  it('replaces an existing ui.componentLibrary', async () => {
    const context = fakeContext();
    await runConfigSet(context, { key: 'ui.componentLibrary', value: 'kendo-jquery' });
    await runConfigSet(context, { key: 'ui.componentLibrary', value: 'none' });

    expect(await context.fs.readFile(join(QA_DIR, 'config.yaml'))).toContain('componentLibrary: none');
  });

  it('rejects an unsupported component library with the supported list', async () => {
    const context = fakeContext();

    await expect(
      runConfigSet(context, { key: 'ui.componentLibrary', value: 'kendo-react' }),
    ).rejects.toMatchObject({
      code: 'CONFIG_SET_VALUE_INVALID',
      remediation: 'Use one of: none, kendo-jquery, kendo-angular.',
    });
  });

  it('rejects an unsupported key', async () => {
    const context = fakeContext();

    await expect(runConfigSet(context, { key: 'testing.bogus', value: 'in-scope' })).rejects.toThrow(QaError);
  });

  it('rejects a key outside the testing block', async () => {
    const context = fakeContext();

    await expect(runConfigSet(context, { key: 'selectors.policy', value: 'in-scope' })).rejects.toThrow(
      QaError,
    );
  });

  it('rejects an invalid testing scope value', async () => {
    const context = fakeContext();

    await expect(runConfigSet(context, { key: 'testing.api', value: 'sort-of' })).rejects.toThrow(QaError);
  });

  it('throws a coded error when config.yaml does not exist yet', async () => {
    const context = createFakeEngineContext({
      projectRoot: PROJECT_ROOT,
      fs: createFakeFileSystem(),
      env: {},
    });

    await expect(runConfigSet(context, { key: 'testing.api', value: 'in-scope' })).rejects.toThrow(QaError);
  });

  it('rejects setting testing.api to in-scope when no api contract is configured', async () => {
    const context = fakeContext();

    await expect(runConfigSet(context, { key: 'testing.api', value: 'in-scope' })).rejects.toThrow(QaError);
  });

  it('allows setting testing.api to in-scope when an api contract is already configured', async () => {
    const withApi = [
      'schemaVersion: 1',
      'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
      'source: { path: app-src }',
      'api: { contract: openapi, source: discover }',
      'environments: {}',
      'identities: {}',
      'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
      'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
      'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
      '',
    ].join('\n');
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: withApi });

    const result = await runConfigSet(context, { key: 'testing.api', value: 'in-scope' });

    expect(result.value).toBe('in-scope');
  });
});
