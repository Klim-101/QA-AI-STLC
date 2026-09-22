// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { hashText } from '../hash.js';
import { noopLogger } from '../ports/logger.js';
import { systemClock } from '../ports/clock.js';
import { createFakeBrowserLauncher } from '../test-support/fake-browser-launcher.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '../test-support/fake-http-client.js';
import { createFakeProcessRunner } from '../test-support/fake-process-runner.js';
import { runCasesAdd } from './cases-add.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function testCaseJson(overrides: { id?: string; feature?: string; requirementIds: string[] }): string {
  return JSON.stringify({
    id: overrides.id ?? 'case-1',
    feature: overrides.feature ?? 'checkout',
    requirementIds: overrides.requirementIds,
    testType: 'e2e',
    title: 'A case',
    steps: [{ description: 'Do something' }],
    expectedResult: 'Something happens',
    status: 'draft',
    createdAt: '2026-09-20T12:00:00Z',
  });
}

function scopeJson(): string {
  return JSON.stringify({
    generatedAt: '2026-09-20T12:00:00Z',
    requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
  });
}

/** A `.qa/manifest.json` registering `artifacts/scope.json`, as a real prior `qa scope` call would. */
function manifestRegisteringScope(scopeContent: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    artifacts: {
      'artifacts/scope.json': {
        sha256: hashText(scopeContent),
        mode: 'text',
        registeredAt: '2026-09-20T12:00:00Z',
      },
    },
  });
}

function fakeContext(files: Readonly<Record<string, string>> = {}): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem(files),
    clock: systemClock,
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

describe('runCasesAdd', () => {
  it('registers a case whose requirement id resolves in the scope artifact', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ id: 'case-1', requirementIds: ['r1'] }),
    });

    const result = await runCasesAdd(context, { path: 'cases/login.json' });

    expect(result).toEqual({
      casePath: 'artifacts/cases/checkout/case-1.json',
      id: 'case-1',
      requirementIds: ['r1'],
    });
    const written = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'artifacts', 'cases', 'checkout', 'case-1.json')),
    ) as { id: string };
    expect(written.id).toBe('case-1');
  });

  it('registers the case artifact in the manifest', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['r1'] }),
    });

    await runCasesAdd(context, { path: 'cases/login.json' });

    const manifest = JSON.parse(await context.fs.readFile(join(QA_DIR, 'manifest.json'))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts).toHaveProperty('artifacts/cases/checkout/case-1.json');
  });

  it('rejects a case linking to a requirement not in the scope artifact', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope(scopeJson()),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['missing'] }),
    });

    const error = await runCasesAdd(context, { path: 'cases/login.json' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('CASE_UNLINKED_REQUIREMENT');
  });

  it('rejects a case when there is no scope artifact at all', async () => {
    const context = fakeContext({
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['r1'] }),
    });

    await expect(runCasesAdd(context, { path: 'cases/login.json' })).rejects.toThrow(QaError);
  });

  it('rejects a hand-edited scope artifact that no longer matches the manifest (P2-07)', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'manifest.json')]: manifestRegisteringScope('{"tampered":true}'),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['r1'] }),
    });

    const error = await runCasesAdd(context, { path: 'cases/login.json' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('ARTIFACT_HASH_MISMATCH');
  });

  it('rejects a scope artifact that exists on disk but was never registered in the manifest', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['r1'] }),
    });

    const error = await runCasesAdd(context, { path: 'cases/login.json' }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('ARTIFACT_UNREGISTERED');
  });

  it('rejects a case file that fails schema validation', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: JSON.stringify({ id: 'case-1', requirementIds: [] }),
    });

    await expect(runCasesAdd(context, { path: 'cases/login.json' })).rejects.toThrow(QaError);
  });

  it('rejects no --path given', async () => {
    const context = fakeContext();

    await expect(runCasesAdd(context, {})).rejects.toThrow(QaError);
  });

  it('rejects a --path that does not exist', async () => {
    const context = fakeContext();

    await expect(runCasesAdd(context, { path: 'cases/missing.json' })).rejects.toThrow(QaError);
  });

  it('rejects a --path outside the project', async () => {
    const context = fakeContext();

    await expect(runCasesAdd(context, { path: '../outside.json' })).rejects.toThrow(QaError);
  });
});
