// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { QaStore } from './qa-store.js';
import { buildTraceabilityMatrix } from './traceability.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');
const NOW = new Date('2026-09-25T12:00:00.000Z');
const CLOCK = { now: () => NOW };

function scopeJson(): string {
  return JSON.stringify({
    schemaVersion: 1,
    generatedAt: '2026-09-20T00:00:00.000Z',
    requirements: [
      {
        id: 'req-1',
        title: 'A registered user can log in',
        source: { kind: 'text', label: 'auth' },
        inScope: true,
      },
      {
        id: 'req-2',
        title: 'A locked account cannot log in',
        source: { kind: 'text', label: 'auth' },
        inScope: true,
      },
    ],
  });
}

function caseJson(overrides: { id: string; requirementIds: string[] }): string {
  return JSON.stringify({
    schemaVersion: 1,
    id: overrides.id,
    feature: 'auth',
    requirementIds: overrides.requirementIds,
    testType: 'e2e',
    title: `Case ${overrides.id}`,
    steps: [{ description: 'Do something' }],
    expectedResult: 'Something happens',
    status: 'approved',
    createdAt: '2026-09-20T00:00:00.000Z',
  });
}

function resultJson(overrides: {
  id: string;
  runId: string;
  testCaseId: string;
  status: string;
  finishedAt: string;
}): string {
  return JSON.stringify({
    schemaVersion: 1,
    id: overrides.id,
    runId: overrides.runId,
    testCaseId: overrides.testCaseId,
    testType: 'e2e',
    status: overrides.status,
    startedAt: '2026-09-25T09:59:00.000Z',
    finishedAt: overrides.finishedAt,
    evidenceIds: ['evidence-1'],
    ...(overrides.status === 'failed' ? { failure: { message: 'boom' } } : {}),
  });
}

function fakeStore(files: Readonly<Record<string, string>> = {}): QaStore {
  return new QaStore({ projectRoot: PROJECT_ROOT, fs: createFakeFileSystem(files) });
}

describe('buildTraceabilityMatrix', () => {
  it('links each requirement to the cases that cite it, with no case for an uncited requirement', async () => {
    const store = fakeStore({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'artifacts', 'cases', 'auth', 'case-1.json')]: caseJson({
        id: 'case-1',
        requirementIds: ['req-1'],
      }),
    });

    const matrix = await buildTraceabilityMatrix(store, CLOCK);

    expect(matrix.generatedAt).toBe(NOW.toISOString());
    const req1 = matrix.requirements.find((requirement) => requirement.requirementId === 'req-1');
    const req2 = matrix.requirements.find((requirement) => requirement.requirementId === 'req-2');
    expect(req1?.cases.map((testCase) => testCase.testCaseId)).toEqual(['case-1']);
    expect(req2?.cases).toEqual([]);
  });

  it('sorts a requirement’s linked cases by id when more than one links to it', async () => {
    const store = fakeStore({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'artifacts', 'cases', 'auth', 'case-b.json')]: caseJson({
        id: 'case-b',
        requirementIds: ['req-1'],
      }),
      [join(QA_DIR, 'artifacts', 'cases', 'auth', 'case-a.json')]: caseJson({
        id: 'case-a',
        requirementIds: ['req-1'],
      }),
    });

    const matrix = await buildTraceabilityMatrix(store, CLOCK);

    const req1 = matrix.requirements.find((requirement) => requirement.requirementId === 'req-1');
    expect(req1?.cases.map((testCase) => testCase.testCaseId)).toEqual(['case-a', 'case-b']);
  });

  it('reports "undefined" as a case’s latest result when it has never been run', async () => {
    const store = fakeStore({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'artifacts', 'cases', 'auth', 'case-1.json')]: caseJson({
        id: 'case-1',
        requirementIds: ['req-1'],
      }),
    });

    const matrix = await buildTraceabilityMatrix(store, CLOCK);

    const req1 = matrix.requirements.find((requirement) => requirement.requirementId === 'req-1');
    expect(req1?.cases[0]?.latestResult).toBeUndefined();
  });

  it('picks the most recent result across every run when a case was run more than once', async () => {
    const store = fakeStore({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'artifacts', 'cases', 'auth', 'case-1.json')]: caseJson({
        id: 'case-1',
        requirementIds: ['req-1'],
      }),
      [join(QA_DIR, 'runs', 'run-1', 'results', 'result-1.json')]: resultJson({
        id: 'result-1',
        runId: 'run-1',
        testCaseId: 'case-1',
        status: 'failed',
        finishedAt: '2026-09-25T10:00:00.000Z',
      }),
      [join(QA_DIR, 'runs', 'run-2', 'results', 'result-2.json')]: resultJson({
        id: 'result-2',
        runId: 'run-2',
        testCaseId: 'case-1',
        status: 'passed',
        finishedAt: '2026-09-25T11:00:00.000Z',
      }),
      // A third, even-older result for the same case, listed last: proves the newest-so-far is
      // kept rather than overwritten by every later result regardless of its own "finishedAt".
      [join(QA_DIR, 'runs', 'run-3', 'results', 'result-3.json')]: resultJson({
        id: 'result-3',
        runId: 'run-3',
        testCaseId: 'case-1',
        status: 'passed',
        finishedAt: '2026-09-25T10:30:00.000Z',
      }),
    });

    const matrix = await buildTraceabilityMatrix(store, CLOCK);

    const req1 = matrix.requirements.find((requirement) => requirement.requirementId === 'req-1');
    expect(req1?.cases[0]?.latestResult).toMatchObject({
      resultId: 'result-2',
      runId: 'run-2',
      status: 'passed',
      evidenceIds: ['evidence-1'],
    });
  });

  it('returns no requirements for a project with no scope.json yet', async () => {
    const store = fakeStore();

    const matrix = await buildTraceabilityMatrix(store, CLOCK);

    expect(matrix.requirements).toEqual([]);
  });

  it('ignores a run’s own run.json when scanning for results', async () => {
    const store = fakeStore({
      [join(QA_DIR, 'artifacts', 'scope.json')]: scopeJson(),
      [join(QA_DIR, 'runs', 'run-1', 'run.json')]: JSON.stringify({ id: 'run-1' }),
    });

    await expect(buildTraceabilityMatrix(store, CLOCK)).resolves.toBeDefined();
  });
});
