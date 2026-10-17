// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { EvalScenario, RunResult, SelectorElement, SelectorRegistry } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { renderEvalReportMarkdown } from './eval-report-markdown.js';
import { scoreEvalRun, type EvalRunData, type EvalSpokeRecord } from './eval-score.js';

const SCENARIO: EvalScenario = {
  schemaVersion: 1,
  id: 'demo',
  title: 'Demo',
  expectedBugs: [
    { bugId: 'BUG-002', signals: [{ kind: 'failed-case', testCaseId: 'filter' }] },
    { bugId: 'BUG-007', signals: [{ kind: 'failed-case', testCaseId: 'greeting' }] },
    {
      bugId: 'BUG-008',
      signals: [
        { kind: 'failed-case', testCaseId: 'sorting' },
        { kind: 'defect-title', pattern: 'sort(ing)? .*priority' },
      ],
    },
  ],
};

function result(testCaseId: string, status: RunResult['status'], minute: number): RunResult {
  const at = `2026-10-17T10:${String(minute).padStart(2, '0')}:00Z`;
  return {
    schemaVersion: 1,
    id: `${testCaseId}-${String(minute)}`,
    runId: 'run-1',
    testCaseId,
    testType: 'e2e',
    status,
    startedAt: at,
    finishedAt: at,
    evidenceIds: [],
    ...(status === 'failed' ? { failure: { message: 'boom' } } : {}),
  };
}

function element(stabilityScore: number, isFragile: boolean, isDeprecated = false): SelectorElement {
  return {
    elementId: `el-${String(stabilityScore)}-${String(isFragile)}`,
    name: 'x',
    kind: 'button',
    locatorCandidates: [{ strategy: 'css', value: '#x', fragile: isFragile }],
    stabilityScore,
    lastVerifiedAt: '2026-10-01T00:00:00Z',
    pii: false,
    dynamicText: false,
    source: 'crawl',
    ...(isDeprecated ? { deprecatedAt: '2026-10-02T00:00:00Z' } : {}),
  };
}

const EMPTY: EvalRunData = { spokeRecords: [], results: [], defects: [] };

function record(
  overrides: Partial<EvalSpokeRecord> & Pick<EvalSpokeRecord, 'spokeId' | 'taskId'>,
): EvalSpokeRecord {
  return { attempt: 1, inputAt: '2026-10-17T10:00:00.000Z', ...overrides };
}

describe('scoreEvalRun: bugs', () => {
  it('counts a bug as found when the latest result of its case failed, and names the case', () => {
    const report = scoreEvalRun(
      SCENARIO,
      {
        ...EMPTY,
        results: [result('filter', 'failed', 1), result('greeting', 'passed', 1)],
      },
      '2026-10-17T11:00:00Z',
    );

    expect(report.bugs).toMatchObject({ expectedCount: 3, detectedCount: 1, detectionRate: 0.3333 });
    expect(report.bugs.results).toEqual([
      { bugId: 'BUG-002', isDetected: true, evidence: 'filter' },
      { bugId: 'BUG-007', isDetected: false },
      { bugId: 'BUG-008', isDetected: false },
    ]);
  });

  it('reads only the latest result of a case, so a fixed bug is no longer found', () => {
    const report = scoreEvalRun(
      SCENARIO,
      { ...EMPTY, results: [result('filter', 'failed', 1), result('filter', 'passed', 2)] },
      'now',
    );

    expect(report.bugs.results[0]?.isDetected).toBe(false);
  });

  it('counts a bug as found by a defect draft whose title matches, ignoring case', () => {
    const report = scoreEvalRun(
      SCENARIO,
      { ...EMPTY, defects: [{ id: 'sort-defect', title: 'Sorting by Priority orders wrongly' }] },
      'now',
    );

    expect(report.bugs.results[2]).toEqual({ bugId: 'BUG-008', isDetected: true, evidence: 'sort-defect' });
  });

  it('has no detection rate when the scenario expects nothing', () => {
    const report = scoreEvalRun({ ...SCENARIO, expectedBugs: [] as never }, EMPTY, 'now');

    expect(report.bugs).toMatchObject({ expectedCount: 0, detectedCount: 0, detectionRate: null });
  });
});

describe('scoreEvalRun: spokes', () => {
  it('counts valid, errored and unanswered attempts per spoke and overall', () => {
    const report = scoreEvalRun(
      SCENARIO,
      {
        ...EMPTY,
        spokeRecords: [
          record({ spokeId: 'triage', taskId: 'run-1', status: 'ok', outputAt: '2026-10-17T10:00:02.000Z' }),
          record({
            spokeId: 'explorer',
            taskId: 'env',
            status: 'error',
            outputAt: '2026-10-17T10:00:01.000Z',
          }),
          record({
            spokeId: 'explorer',
            taskId: 'env',
            attempt: 2,
            inputAt: '2026-10-17T10:00:01.000Z',
            status: 'ok',
            outputAt: '2026-10-17T10:00:04.000Z',
          }),
          record({ spokeId: 'explorer', taskId: 'other' }),
        ],
      },
      'now',
    );

    expect(report.spokes).toMatchObject({
      attempts: 4,
      okResponses: 2,
      errorResponses: 1,
      unanswered: 1,
      retriedTaskCount: 1,
      validResponseRate: 0.5,
    });
    expect(report.spokes.bySpoke).toEqual([
      {
        spokeId: 'explorer',
        attempts: 3,
        okResponses: 1,
        errorResponses: 1,
        unanswered: 1,
        totalDurationMs: 4000,
      },
      {
        spokeId: 'triage',
        attempts: 1,
        okResponses: 1,
        errorResponses: 0,
        unanswered: 0,
        totalDurationMs: 2000,
      },
    ]);
  });

  it('has no valid-response rate when nothing was dispatched', () => {
    const report = scoreEvalRun(SCENARIO, EMPTY, 'now');

    expect(report.spokes).toMatchObject({ attempts: 0, validResponseRate: null, bySpoke: [] });
  });

  it('does not count an answer that came before its dispatch as negative time', () => {
    const report = scoreEvalRun(
      SCENARIO,
      {
        ...EMPTY,
        spokeRecords: [
          record({ spokeId: 'triage', taskId: 't', status: 'ok', outputAt: '2026-10-17T09:59:59.000Z' }),
        ],
      },
      'now',
    );

    expect(report.spokes.bySpoke[0]?.totalDurationMs).toBe(0);
    expect(report.duration.spokeSpanMs).toBe(0);
  });
});

describe('scoreEvalRun: selectors and duration', () => {
  it('averages the stability of live elements and counts those whose primary locator is fragile', () => {
    const registry: SelectorRegistry = {
      schemaVersion: 1,
      generatedAt: '2026-10-17T10:00:00Z',
      elements: [element(1, false), element(0.5, true), element(0, true, true)],
    };

    const report = scoreEvalRun(SCENARIO, { ...EMPTY, registry }, 'now');

    expect(report.selectors).toEqual({ elementCount: 2, meanStabilityScore: 0.75, fragileCount: 1 });
  });

  it('has no stability score without a registry', () => {
    expect(scoreEvalRun(SCENARIO, EMPTY, 'now').selectors).toEqual({
      elementCount: 0,
      meanStabilityScore: null,
      fragileCount: 0,
    });
  });

  it('measures from the first dispatch to the last answer, and not at all when nothing was answered', () => {
    const answered = scoreEvalRun(
      SCENARIO,
      {
        ...EMPTY,
        spokeRecords: [
          record({ spokeId: 'a', taskId: '1', status: 'ok', outputAt: '2026-10-17T10:00:03.000Z' }),
          record({
            spokeId: 'b',
            taskId: '2',
            inputAt: '2026-10-17T10:00:01.000Z',
            status: 'ok',
            outputAt: '2026-10-17T10:00:07.000Z',
          }),
        ],
      },
      'now',
    );
    const unanswered = scoreEvalRun(
      SCENARIO,
      { ...EMPTY, spokeRecords: [record({ spokeId: 'a', taskId: '1' })] },
      'now',
    );

    expect(answered.duration.spokeSpanMs).toBe(7000);
    expect(unanswered.duration.spokeSpanMs).toBeNull();
  });

  it('says that tokens and cost are not measured', () => {
    expect(scoreEvalRun(SCENARIO, EMPTY, 'now').notMeasured).toEqual(['tokens', 'cost']);
  });
});

describe('renderEvalReportMarkdown', () => {
  it('renders the numbers of the report, and n/a where there is nothing to divide by', () => {
    const empty = renderEvalReportMarkdown(
      scoreEvalRun({ ...SCENARIO, expectedBugs: [] as never }, EMPTY, '2026-10-17T11:00:00Z'),
    );
    const full = renderEvalReportMarkdown(
      scoreEvalRun(
        SCENARIO,
        {
          ...EMPTY,
          results: [result('filter', 'failed', 1)],
          spokeRecords: [
            record({ spokeId: 'triage', taskId: 'r', status: 'ok', outputAt: '2026-10-17T10:00:02.000Z' }),
          ],
          registry: { schemaVersion: 1, generatedAt: 'x', elements: [element(0.8, false)] },
        },
        '2026-10-17T11:00:00Z',
      ),
    );

    expect(empty).toContain('0 of 0 (n/a)');
    expect(empty).toContain('mean stability n/a');
    expect(empty).toContain('Spokes ran for n/a');
    expect(full).toContain('1 of 3 (33.3%)');
    expect(full).toContain('| BUG-002 | yes | filter |');
    expect(full).toContain('| triage | 1 | 1 | 0 | 0 | 2.0 s |');
    expect(full).toContain('mean stability 0.80');
    expect(full).toContain('Not measured: tokens, cost.');
  });
});
