// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaStore } from '../qa-store.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { runEvalScore } from './eval-score.js';

const SCENARIO = {
  schemaVersion: 1,
  id: 'demo',
  title: 'Demo',
  expectedBugs: [
    { bugId: 'BUG-002', signals: [{ kind: 'failed-case', testCaseId: 'filter' }] },
    { bugId: 'BUG-004', signals: [{ kind: 'defect-title', pattern: 'delet' }] },
    { bugId: 'BUG-008', signals: [{ kind: 'requirement', requirementId: 'req-3' }] },
  ],
};

function spokeInput(
  spokeId: string,
  taskId: string,
  attempt: number,
  recordedAt: string,
): Record<string, unknown> {
  return { schemaVersion: 1, runId: 'run-1', spokeId, taskId, attempt, task: 'Do it', recordedAt };
}

function spokeOutput(
  spokeId: string,
  taskId: string,
  attempt: number,
  status: 'ok' | 'error',
  recordedAt: string,
) {
  return {
    schemaVersion: 1,
    runId: 'run-1',
    attempt,
    recordedAt,
    result:
      status === 'ok'
        ? { schemaVersion: 1, spokeId, taskId, status, payload: {} }
        : { schemaVersion: 1, spokeId, taskId, status, error: { code: 'X', message: 'bad' } },
  };
}

async function projectWithRun(): Promise<EngineContext> {
  const fs = createFakeFileSystem();
  const context = createFakeEngineContext({ fs, clock: { now: () => new Date('2026-10-17T12:00:00Z') } });
  const store = new QaStore({ projectRoot: 'project', fs });
  const base = 'runs/run-1/spokes/explorer/env/attempt';
  await store.writeJson(`${base}-1/input.json`, spokeInput('explorer', 'env', 1, '2026-10-17T10:00:00.000Z'));
  await store.writeJson(
    `${base}-1/output.json`,
    spokeOutput('explorer', 'env', 1, 'error', '2026-10-17T10:00:01.000Z'),
  );
  await store.writeJson(`${base}-2/input.json`, spokeInput('explorer', 'env', 2, '2026-10-17T10:00:02.000Z'));
  await store.writeJson(
    `${base}-2/output.json`,
    spokeOutput('explorer', 'env', 2, 'ok', '2026-10-17T10:00:05.000Z'),
  );
  await store.writeJson(
    'runs/run-1/spokes/triage/run-1/attempt-1/input.json',
    spokeInput('triage', 'run-1', 1, '2026-10-17T10:00:06.000Z'),
  );
  // A stray folder under a task is not an attempt.
  await store.writeJson('runs/run-1/spokes/explorer/env/notes/input.json', {});
  await store.writeJson('runs/run-1/results/r-filter.json', {
    schemaVersion: 1,
    id: 'r-filter',
    runId: 'run-1',
    testCaseId: 'filter',
    testType: 'e2e',
    status: 'failed',
    startedAt: '2026-10-17T10:00:00Z',
    finishedAt: '2026-10-17T10:00:01Z',
    evidenceIds: [],
    failure: { message: 'boom' },
  });
  await store.writeJson('artifacts/cases/sorting/tc-sort.json', {
    schemaVersion: 1,
    id: 'tc-sort',
    feature: 'sorting',
    requirementIds: ['req-3'],
    testType: 'e2e',
    title: 'Sorting orders by priority',
    steps: [{ description: 'Sort the list' }],
    expectedResult: 'High, medium, low',
    status: 'approved',
    createdAt: '2026-10-17T10:00:00Z',
  });
  await store.writeJson('runs/run-1/results/r-sort.json', {
    schemaVersion: 1,
    id: 'r-sort',
    runId: 'run-1',
    testCaseId: 'tc-sort',
    testType: 'e2e',
    status: 'failed',
    startedAt: '2026-10-17T10:00:00Z',
    finishedAt: '2026-10-17T10:00:01Z',
    evidenceIds: [],
    failure: { message: 'wrong order' },
  });
  await store.writeJson('artifacts/defects/delete-defect.json', {
    schemaVersion: 1,
    id: 'delete-defect',
    title: 'Deleting a task does nothing',
    severityProposal: 'major',
    category: 'functional',
    steps: ['Delete a task'],
    expectedResult: 'Gone',
    actualResult: 'Still there',
    environment: 'staging',
    requirementIds: [],
    evidencePaths: [],
    status: 'draft',
    createdAt: '2026-10-17T10:00:00Z',
  });
  await store.writeJson('selectors/registry.json', {
    schemaVersion: 1,
    generatedAt: '2026-10-17T10:00:00Z',
    elements: [
      {
        elementId: 'el-1',
        name: 'Log in',
        kind: 'button',
        locatorCandidates: [{ strategy: 'role', value: '{"role":"button","name":"Log in"}', fragile: false }],
        stabilityScore: 0.9,
        lastVerifiedAt: '2026-10-17T10:00:00Z',
        pii: false,
        dynamicText: false,
        source: 'crawl',
      },
    ],
  });
  return context;
}

describe('runEvalScore', () => {
  it('scores the spoke records, results, defect drafts and registry of a project', async () => {
    const context = await projectWithRun();

    const report = await runEvalScore(context, { scenario: SCENARIO });

    expect(report.scenarioId).toBe('demo');
    expect(report.generatedAt).toBe('2026-10-17T12:00:00.000Z');
    expect(report.bugs.results).toEqual([
      { bugId: 'BUG-002', isDetected: true, evidence: 'filter' },
      { bugId: 'BUG-004', isDetected: true, evidence: 'delete-defect' },
      { bugId: 'BUG-008', isDetected: true, evidence: 'tc-sort' },
    ]);
    expect(report.spokes).toMatchObject({
      attempts: 3,
      okResponses: 1,
      errorResponses: 1,
      unanswered: 1,
      retriedTaskCount: 1,
    });
    expect(report.selectors).toEqual({ elementCount: 1, meanStabilityScore: 0.9, fragileCount: 0 });
    expect(report.duration.spokeSpanMs).toBe(5000);
  });

  it('scores an empty project without failing', async () => {
    const report = await runEvalScore(createFakeEngineContext({ fs: createFakeFileSystem() }), {
      scenario: SCENARIO,
    });

    expect(report.bugs.detectedCount).toBe(0);
    expect(report.spokes.attempts).toBe(0);
    expect(report.selectors.elementCount).toBe(0);
    expect(report.duration.spokeSpanMs).toBeNull();
  });

  it('refuses a scenario that does not match its schema', async () => {
    await expect(
      runEvalScore(createFakeEngineContext({ fs: createFakeFileSystem() }), {
        scenario: { ...SCENARIO, expectedBugs: [] },
      }),
    ).rejects.toMatchObject({ code: 'EVAL_SCENARIO_INVALID' });
  });
});
