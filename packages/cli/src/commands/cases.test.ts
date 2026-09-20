// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError } from '@qa-ai-stlc/core';
import { describe, expect, it } from 'vitest';
import { createCommandContext, type CommandContext } from '../command-context.js';
import { createFakeFileSystem } from '../test-support/fake-file-system.js';
import { runCasesAdd } from './cases.js';

const noopIo = { stdout: () => undefined, stderr: () => undefined };
const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function testCaseJson(overrides: { id?: string; requirementIds: string[] }): string {
  return JSON.stringify({
    id: overrides.id ?? 'case-1',
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

function fakeContext(files: Readonly<Record<string, string>> = {}): CommandContext {
  return createCommandContext({
    projectRoot: PROJECT_ROOT,
    io: noopIo,
    fs: createFakeFileSystem(files),
    env: {},
  });
}

describe('runCasesAdd', () => {
  it('registers a case whose requirement id resolves in the scope artifact', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ id: 'case-1', requirementIds: ['r1'] }),
    });

    const result = await runCasesAdd(context, { path: 'cases/login.json' });

    expect(result).toEqual({
      casePath: 'artifacts/cases/case-1.json',
      id: 'case-1',
      requirementIds: ['r1'],
    });
    const written = JSON.parse(
      await context.fs.readFile(join(QA_DIR, 'artifacts', 'cases', 'case-1.json')),
    ) as { id: string };
    expect(written.id).toBe('case-1');
  });

  it('registers the case artifact in the manifest', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(PROJECT_ROOT, 'cases', 'login.json')]: testCaseJson({ requirementIds: ['r1'] }),
    });

    await runCasesAdd(context, { path: 'cases/login.json' });

    const manifest = JSON.parse(await context.fs.readFile(join(QA_DIR, 'manifest.json'))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts).toHaveProperty('artifacts/cases/case-1.json');
  });

  it('rejects a case linking to a requirement not in the scope artifact', async () => {
    const context = fakeContext({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
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
