// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// Sets two runs of the same scenario side by side, sequential and parallel (P4-08). Each run brings
// its eval report (what it found, how many responses were valid) and its run metrics (how it was
// carried out). Cost is not in either: the engine reads no host transcript.

function rate(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function seconds(milliseconds) {
  return milliseconds === null ? 'n/a' : `${(milliseconds / 1000).toFixed(1)} s`;
}

/**
 * @param {string} scenarioId
 * @param {readonly { label: string; parallelism: number; report: any; metrics: any }[]} runs
 */
export function buildComparison(scenarioId, runs) {
  const rows = runs.map(({ label, parallelism, report, metrics }) => ({
    label,
    parallelism,
    bugsDetected: report.bugs.detectedCount,
    bugsExpected: report.bugs.expectedCount,
    validResponseRate: report.spokes.validResponseRate,
    attempts: metrics.dispatch.attempts,
    retriesUsed: metrics.retries.used,
    spanMs: metrics.timing.spanMs,
    busyMs: metrics.timing.busyMs,
    activeMs: metrics.timing.activeMs,
    overlapSavingMs: metrics.timing.overlapSavingMs,
    peakConcurrency: metrics.concurrency.peak,
    isWithinBudget: metrics.concurrency.isWithinBudget,
  }));
  const [first, ...others] = runs;
  const sameFindings =
    first === undefined ||
    others.every(
      (run) => JSON.stringify(run.report.bugs.results) === JSON.stringify(first.report.bugs.results),
    );
  const sameResponses =
    first === undefined ||
    others.every(
      (run) =>
        run.report.spokes.okResponses === first.report.spokes.okResponses &&
        run.report.spokes.attempts === first.report.spokes.attempts,
    );
  return { scenarioId, rows, sameFindings, sameResponses, notMeasured: ['tokens', 'cost'] };
}

export function renderComparisonMarkdown(comparison) {
  return [
    `# Sequential and parallel: ${comparison.scenarioId}`,
    '',
    '| Mode | agents.parallelism | Bugs found | Valid responses | Attempts | Retries | Span | Attempts added up | Active | Saved by overlap | Peak at once |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...comparison.rows.map(
      (row) =>
        `| ${row.label} | ${String(row.parallelism)} | ${String(row.bugsDetected)} of ${String(row.bugsExpected)} | ${rate(row.validResponseRate)} | ${String(row.attempts)} | ${String(row.retriesUsed)} | ${seconds(row.spanMs)} | ${seconds(row.busyMs)} | ${seconds(row.activeMs)} | ${seconds(row.overlapSavingMs)} | ${String(row.peakConcurrency)}${row.isWithinBudget ? '' : ' (over budget)'} |`,
    ),
    '',
    `The same bugs were found in every mode: ${comparison.sameFindings ? 'yes' : 'NO'}. The same responses were valid: ${comparison.sameResponses ? 'yes' : 'NO'}.`,
    '',
    'The spokes of the scripted baseline are engine calls, not model calls, so these times show how the engine behaves in each mode, not how long an agent takes: that needs a run in a host.',
    '',
    `Not measured: ${comparison.notMeasured.join(', ')}. The engine reads no host transcript, so it has no true figure for them.`,
    '',
  ].join('\n');
}
