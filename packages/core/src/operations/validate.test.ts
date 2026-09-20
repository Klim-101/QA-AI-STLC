// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { noopLogger } from '../ports/logger.js';
import { systemClock } from '../ports/clock.js';
import { createFakeBrowserLauncher } from '../test-support/fake-browser-launcher.js';
import { createFakeFileSystem } from '../test-support/fake-file-system.js';
import { createFakeHttpClient } from '../test-support/fake-http-client.js';
import { createFakeProcessRunner } from '../test-support/fake-process-runner.js';
import { runApprove } from './approve.js';
import { runValidate } from './validate.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function fakeContext(files: Readonly<Record<string, string>> = {}): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem(
      Object.fromEntries(Object.entries(files).map(([path, content]) => [join(QA_DIR, path), content])),
    ),
    clock: systemClock,
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

describe('runValidate', () => {
  it('reports every gate open and nothing reopened on a fresh project', async () => {
    const context = fakeContext();

    const report = await runValidate(context);

    expect(report.state.gates.scope.status).toBe('open');
    expect(report.state.gates.cases.status).toBe('open');
    expect(report.reopened).toEqual([]);
  });

  it('does not report a never-approved gate as reopened', async () => {
    const context = fakeContext();

    const report = await runValidate(context);

    expect(report.reopened).not.toContain('scope');
  });

  it('reports a satisfied gate as reopened once its approved artifact changes', async () => {
    const context = fakeContext({ 'artifacts/scope.json': '{"requirements":[]}' });
    await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
    });

    await context.fs.writeFile(join(QA_DIR, 'artifacts/scope.json'), '{"requirements":[{"id":"R1"}]}');
    const report = await runValidate(context);

    expect(report.state.gates.scope.status).toBe('open');
    expect(report.reopened).toEqual(['scope']);
  });

  it('reports a satisfied gate that still matches as satisfied, not reopened', async () => {
    const context = fakeContext({ 'artifacts/scope.json': '{"requirements":[]}' });
    await runApprove(context, {
      gate: 'scope',
      artifactPath: 'artifacts/scope.json',
      approvedBy: 'operator',
    });

    const report = await runValidate(context);

    expect(report.state.gates.scope.status).toBe('satisfied');
    expect(report.reopened).toEqual([]);
  });

  it('reports no unlinked cases when none are registered', async () => {
    const context = fakeContext();

    const report = await runValidate(context);

    expect(report.unlinkedCases).toEqual([]);
  });

  it('reports no unlinked cases when every requirement id resolves', async () => {
    const context = fakeContext({
      'artifacts/scope.json': JSON.stringify({
        generatedAt: '2026-09-20T12:00:00Z',
        requirements: [{ id: 'r1', title: 'R1', source: { kind: 'text', label: 'x' }, inScope: true }],
      }),
      'artifacts/cases/case-1.json': JSON.stringify(testCase({ requirementIds: ['r1'] })),
    });

    const report = await runValidate(context);

    expect(report.unlinkedCases).toEqual([]);
  });

  it('reports a case whose requirement id does not resolve in the scope artifact', async () => {
    const context = fakeContext({
      'artifacts/scope.json': '{"generatedAt":"2026-09-20T12:00:00Z","requirements":[]}',
      'artifacts/cases/case-1.json': JSON.stringify(testCase({ id: 'case-1', requirementIds: ['missing'] })),
    });

    const report = await runValidate(context);

    expect(report.unlinkedCases).toEqual([
      { casePath: 'artifacts/cases/case-1.json', id: 'case-1', unlinkedRequirementIds: ['missing'] },
    ]);
  });

  it('treats every requirement id as unlinked when there is no scope artifact at all', async () => {
    const context = fakeContext({
      'artifacts/cases/case-1.json': JSON.stringify(testCase({ requirementIds: ['r1'] })),
    });

    const report = await runValidate(context);

    expect(report.unlinkedCases).toHaveLength(1);
  });
});

function testCase(overrides: { id?: string; requirementIds: string[] }): Record<string, unknown> {
  return {
    id: overrides.id ?? 'case-1',
    requirementIds: overrides.requirementIds,
    testType: 'e2e',
    title: 'A case',
    steps: [{ description: 'Do something' }],
    expectedResult: 'Something happens',
    status: 'draft',
    createdAt: '2026-09-20T12:00:00Z',
  };
}
