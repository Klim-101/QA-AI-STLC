// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { noopLogger } from '../ports/logger.js';
import { runApprove } from './approve.js';
import { runScope } from './scope.js';
import { runScopeSet } from './scope-set.js';
import { runValidate } from './validate.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');
const SCOPE_FILE = join(QA_DIR, 'artifacts', 'scope.json');
const REQUIREMENTS_FILE = join(PROJECT_ROOT, 'docs', 'requirements.md');

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

// A clock that moves on every read, so a rewrite of the scope shows in `generatedAt`.
function fakeContext(): EngineContext {
  let tick = 0;
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({
      [join(QA_DIR, 'config.yaml')]: CONFIG_YAML,
      [REQUIREMENTS_FILE]: '## Login\nbody\n\n## Signup\nbody\n\n## Reset\nbody\n',
    }),
    clock: {
      now: () => {
        tick += 1;
        return new Date(Date.UTC(2026, 9, 23, 12, 0, tick));
      },
    },
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

async function scopedContext(): Promise<EngineContext> {
  const context = fakeContext();
  await runScope(context, { from: 'file', path: 'docs/requirements.md' });
  return context;
}

async function readInScope(context: EngineContext): Promise<Record<string, boolean>> {
  const scope = JSON.parse(await context.fs.readFile(SCOPE_FILE)) as {
    requirements: { id: string; inScope: boolean }[];
  };
  return Object.fromEntries(scope.requirements.map((entry) => [entry.id, entry.inScope]));
}

describe('runScopeSet', () => {
  it('takes the named requirements out of scope and counts both sides', async () => {
    const context = await scopedContext();

    const result = await runScopeSet(context, { requirementIds: ['signup', 'reset'], inScope: false });

    expect(result).toEqual({
      scopePath: 'artifacts/scope.json',
      changed: 2,
      inScopeCount: 1,
      outOfScopeCount: 2,
    });
    expect(await readInScope(context)).toEqual({ login: true, signup: false, reset: false });
  });

  it('puts a requirement back into scope', async () => {
    const context = await scopedContext();
    await runScopeSet(context, { requirementIds: ['signup'], inScope: false });

    const result = await runScopeSet(context, { requirementIds: ['signup'], inScope: true });

    expect(result.changed).toBe(1);
    expect(await readInScope(context)).toEqual({ login: true, signup: true, reset: true });
  });

  it('registers the rewritten scope in the manifest, so it still verifies', async () => {
    const context = await scopedContext();

    await runScopeSet(context, { requirementIds: ['signup'], inScope: false });

    const merged = await runScope(context, { from: 'file', path: 'docs/requirements.md' });
    expect(merged.total).toBe(3);
  });

  it('counts only the requirements it moved when one is already where it was asked to be', async () => {
    const context = await scopedContext();
    await runScopeSet(context, { requirementIds: ['signup'], inScope: false });

    const result = await runScopeSet(context, { requirementIds: ['signup', 'reset'], inScope: false });

    expect(result.changed).toBe(1);
  });

  it('writes nothing when no requirement would move', async () => {
    const context = await scopedContext();
    const before = await context.fs.readFile(SCOPE_FILE);

    const result = await runScopeSet(context, { requirementIds: ['login'], inScope: true });

    expect(result.changed).toBe(0);
    expect(await context.fs.readFile(SCOPE_FILE)).toBe(before);
  });

  it('rejects an id that is not in the scope and changes nothing', async () => {
    const context = await scopedContext();
    const before = await context.fs.readFile(SCOPE_FILE);

    const error = await runScopeSet(context, { requirementIds: ['signup', 'typo'], inScope: false }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(QaError);
    expect(error).toMatchObject({ code: 'SCOPE_REQUIREMENT_NOT_FOUND' });
    expect((error as QaError).message).toContain('typo');
    expect(await context.fs.readFile(SCOPE_FILE)).toBe(before);
  });

  it('rejects the call before any requirements were extracted', async () => {
    const context = fakeContext();

    await expect(runScopeSet(context, { requirementIds: ['login'], inScope: false })).rejects.toMatchObject({
      code: 'SCOPE_NOT_FOUND',
    });
  });

  it('reopens an approved scope gate, because the approval is bound to the artifact hash', async () => {
    const context = await scopedContext();
    await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
    });
    expect((await runValidate(context)).reopened).toEqual([]);

    await runScopeSet(context, { requirementIds: ['signup'], inScope: false });

    expect((await runValidate(context)).reopened).toContain('scope');
  });
});
