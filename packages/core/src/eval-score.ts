// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  type EvalBugResult,
  type EvalReport,
  type EvalScenario,
  type EvalSpokeMetrics,
  type RunResult,
  type SelectorRegistry,
} from '@qa-ai-stlc/schemas';

/** One attempt of a spoke task as the spoke I/O store holds it. */
export interface EvalSpokeRecord {
  readonly spokeId: string;
  readonly taskId: string;
  readonly attempt: number;
  readonly inputAt: string;
  readonly outputAt?: string;
  readonly status?: 'ok' | 'error';
}

export interface EvalRunData {
  readonly spokeRecords: readonly EvalSpokeRecord[];
  readonly results: readonly RunResult[];
  readonly defects: readonly { readonly id: string; readonly title: string }[];
  readonly registry?: SelectorRegistry;
}

// Four decimals, so a rate in a report reads the same on every machine.
function roundRate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function rateOf(part: number, whole: number): number | null {
  return whole === 0 ? null : roundRate(part / whole);
}

function latestResultOf(results: readonly RunResult[], testCaseId: string): RunResult | undefined {
  return results
    .filter((result) => result.testCaseId === testCaseId)
    .toSorted((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime())[0];
}

function scoreBugs(scenario: EvalScenario, data: EvalRunData): EvalReport['bugs'] {
  const results: EvalBugResult[] = scenario.expectedBugs.map((expected) => {
    for (const signal of expected.signals) {
      if (signal.kind === 'failed-case') {
        if (latestResultOf(data.results, signal.testCaseId)?.status === 'failed') {
          return { bugId: expected.bugId, isDetected: true, evidence: signal.testCaseId };
        }
        continue;
      }
      const pattern = new RegExp(signal.pattern, 'iu');
      const defect = data.defects.find((candidate) => pattern.test(candidate.title));
      if (defect !== undefined) {
        return { bugId: expected.bugId, isDetected: true, evidence: defect.id };
      }
    }
    return { bugId: expected.bugId, isDetected: false };
  });
  const detectedCount = results.filter((result) => result.isDetected).length;
  return {
    expectedCount: results.length,
    detectedCount,
    detectionRate: rateOf(detectedCount, results.length),
    results,
  };
}

function groupBy<TItem>(items: readonly TItem[], keyOf: (item: TItem) => string): Map<string, TItem[]> {
  const groups = new Map<string, TItem[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function durationMs(record: EvalSpokeRecord): number {
  if (record.outputAt === undefined) {
    return 0;
  }
  return Math.max(0, new Date(record.outputAt).getTime() - new Date(record.inputAt).getTime());
}

function scoreSpokes(records: readonly EvalSpokeRecord[]): EvalReport['spokes'] {
  const bySpokeId = groupBy(records, (record) => record.spokeId);
  const bySpoke: EvalSpokeMetrics[] = [...bySpokeId.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([spokeId, own]) => ({
      spokeId,
      attempts: own.length,
      okResponses: own.filter((record) => record.status === 'ok').length,
      errorResponses: own.filter((record) => record.status === 'error').length,
      unanswered: own.filter((record) => record.status === undefined).length,
      totalDurationMs: own.reduce((total, record) => total + durationMs(record), 0),
    }));
  const attemptsByTask = groupBy(records, (record) => `${record.spokeId}/${record.taskId}`);
  const okResponses = records.filter((record) => record.status === 'ok').length;
  return {
    attempts: records.length,
    okResponses,
    errorResponses: records.filter((record) => record.status === 'error').length,
    unanswered: records.filter((record) => record.status === undefined).length,
    retriedTaskCount: [...attemptsByTask.values()].filter((attempts) => attempts.length > 1).length,
    validResponseRate: rateOf(okResponses, records.length),
    bySpoke,
  };
}

function scoreSelectors(registry: SelectorRegistry | undefined): EvalReport['selectors'] {
  const elements = (registry?.elements ?? []).filter((element) => element.deprecatedAt === undefined);
  const total = elements.reduce((sum, element) => sum + element.stabilityScore, 0);
  return {
    elementCount: elements.length,
    meanStabilityScore: elements.length === 0 ? null : roundRate(total / elements.length),
    fragileCount: elements.filter((element) => element.locatorCandidates[0]?.fragile === true).length,
  };
}

function scoreDuration(records: readonly EvalSpokeRecord[]): EvalReport['duration'] {
  const starts = records.map((record) => new Date(record.inputAt).getTime());
  const ends = records.flatMap((record) =>
    record.outputAt === undefined ? [] : [new Date(record.outputAt).getTime()],
  );
  if (starts.length === 0 || ends.length === 0) {
    return { spokeSpanMs: null };
  }
  return { spokeSpanMs: Math.max(0, Math.max(...ends) - Math.min(...starts)) };
}

/**
 * Scores a run against a scenario (P4-07): which catalogued bugs it found, how many spoke
 * attempts were answered with a valid result, how stable the selectors it registered are, and how
 * long its spokes took. Everything is read from what the engine recorded; a rate with nothing to
 * divide by is `null`, never `0`. Token use and cost are listed as not measured, since the engine
 * reads no host transcript.
 */
export function scoreEvalRun(scenario: EvalScenario, data: EvalRunData, generatedAt: string): EvalReport {
  return {
    schemaVersion: SCHEMA_VERSION,
    scenarioId: scenario.id,
    generatedAt,
    bugs: scoreBugs(scenario, data),
    spokes: scoreSpokes(data.spokeRecords),
    selectors: scoreSelectors(data.registry),
    duration: scoreDuration(data.spokeRecords),
    notMeasured: ['tokens', 'cost'],
  };
}
