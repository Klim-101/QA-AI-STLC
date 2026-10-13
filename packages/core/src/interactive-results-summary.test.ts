// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { buildInteractiveResultsSummary } from './interactive-results-summary.js';
import { QaStore } from './qa-store.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function resultJson(overrides: {
  id: string;
  runId: string;
  testCaseId: string;
  status: string;
  finishedAt: string;
  failure?: string;
}): string {
  return JSON.stringify({
    schemaVersion: 1,
    id: overrides.id,
    runId: overrides.runId,
    testCaseId: overrides.testCaseId,
    testType: 'e2e',
    status: overrides.status,
    startedAt: '2026-10-13T14:00:00.000Z',
    finishedAt: overrides.finishedAt,
    evidenceIds: ['evidence-1', 'evidence-2'],
    ...(overrides.status === 'failed'
      ? { failure: { message: overrides.failure ?? 'The check failed' } }
      : {}),
  });
}

function storeWith(files: Readonly<Record<string, string>>): QaStore {
  const absolute = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [join(QA_DIR, path), content]),
  );
  return new QaStore({ projectRoot: PROJECT_ROOT, fs: createFakeFileSystem(absolute) });
}

describe('buildInteractiveResultsSummary', () => {
  it('is undefined when no live execution result exists', async () => {
    expect(await buildInteractiveResultsSummary(storeWith({}))).toBeUndefined();
  });

  it('ignores results written by qa run', async () => {
    const store = storeWith({
      'runs/run-1/results/result-1.json': resultJson({
        id: 'result-1',
        runId: 'run-1',
        testCaseId: 'case-a',
        status: 'passed',
        finishedAt: '2026-10-13T15:01:00.000Z',
      }),
    });

    expect(await buildInteractiveResultsSummary(store)).toBeUndefined();
  });

  it('keeps one row per case from its latest result and counts earlier ones', async () => {
    const store = storeWith({
      'runs/case-a/result-new.json': resultJson({
        id: 'result-new',
        runId: 'run-2',
        testCaseId: 'case-a',
        status: 'passed',
        finishedAt: '2026-10-13T16:00:00.000Z',
      }),
      'runs/case-a/result-old.json': resultJson({
        id: 'result-old',
        runId: 'run-1',
        testCaseId: 'case-a',
        status: 'uncertain',
        finishedAt: '2026-10-13T15:00:00.000Z',
      }),
      'runs/case-b/result-b.json': resultJson({
        id: 'result-b',
        runId: 'run-3',
        testCaseId: 'case-b',
        status: 'blocked',
        finishedAt: '2026-10-13T17:00:00.000Z',
      }),
    });

    const summary = await buildInteractiveResultsSummary(store);

    expect(
      summary?.rows.map((row) => [row.testCaseId, row.status, row.resultCount, row.evidenceCount]),
    ).toEqual([
      ['case-a', 'passed', 2, 2],
      ['case-b', 'blocked', 1, 2],
    ]);
    expect(summary?.counts).toEqual({
      passed: 1,
      failed: 0,
      blocked: 1,
      skipped: 0,
      uncertain: 0,
      partial: 0,
    });
    expect(summary?.runId).toBeUndefined();
  });

  it('keeps the latest result when an older one is listed after it', async () => {
    const store = storeWith({
      'runs/case-a/a-newer.json': resultJson({
        id: 'a-newer',
        runId: 'run-2',
        testCaseId: 'case-a',
        status: 'failed',
        finishedAt: '2026-10-13T16:00:00.000Z',
      }),
      'runs/case-a/b-older.json': resultJson({
        id: 'b-older',
        runId: 'run-1',
        testCaseId: 'case-a',
        status: 'passed',
        finishedAt: '2026-10-13T15:00:00.000Z',
      }),
    });

    expect((await buildInteractiveResultsSummary(store))?.rows[0]?.status).toBe('failed');
  });

  it('replaces an earlier result with a later one listed after it', async () => {
    const store = storeWith({
      'runs/case-a/a-older.json': resultJson({
        id: 'a-older',
        runId: 'run-1',
        testCaseId: 'case-a',
        status: 'passed',
        finishedAt: '2026-10-13T15:00:00.000Z',
      }),
      'runs/case-a/b-newer.json': resultJson({
        id: 'b-newer',
        runId: 'run-2',
        testCaseId: 'case-a',
        status: 'blocked',
        finishedAt: '2026-10-13T16:00:00.000Z',
      }),
    });

    expect((await buildInteractiveResultsSummary(store))?.rows[0]?.status).toBe('blocked');
  });

  it('narrows to one run and reports it', async () => {
    const store = storeWith({
      'runs/case-a/result-a.json': resultJson({
        id: 'result-a',
        runId: 'run-1',
        testCaseId: 'case-a',
        status: 'passed',
        finishedAt: '2026-10-13T15:01:00.000Z',
      }),
      'runs/case-b/result-b.json': resultJson({
        id: 'result-b',
        runId: 'run-2',
        testCaseId: 'case-b',
        status: 'failed',
        finishedAt: '2026-10-13T15:02:00.000Z',
      }),
    });

    const summary = await buildInteractiveResultsSummary(store, { runId: 'run-2' });

    expect(summary?.runId).toBe('run-2');
    expect(summary?.rows.map((row) => row.testCaseId)).toEqual(['case-b']);
    expect(await buildInteractiveResultsSummary(store, { runId: 'run-9' })).toBeUndefined();
  });

  it('shows the first line of a failure message, capped', async () => {
    const store = storeWith({
      'runs/case-a/result-a.json': resultJson({
        id: 'result-a',
        runId: 'run-1',
        testCaseId: 'case-a',
        status: 'failed',
        finishedAt: '2026-10-13T15:01:00.000Z',
        failure: `${'x'.repeat(250)}\nsecond line`,
      }),
      'runs/case-b/result-b.json': resultJson({
        id: 'result-b',
        runId: 'run-2',
        testCaseId: 'case-b',
        status: 'failed',
        finishedAt: '2026-10-13T15:02:00.000Z',
        failure: 'short\nsecond line',
      }),
    });

    const summary = await buildInteractiveResultsSummary(store);

    expect(summary?.rows[0]?.failureMessage).toBe(`${'x'.repeat(200)}…`);
    expect(summary?.rows[1]?.failureMessage).toBe('short');
  });
});
