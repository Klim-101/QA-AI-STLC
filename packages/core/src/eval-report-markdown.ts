// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { EvalReport } from '@qa-ai-stlc/schemas';

function formatRate(rate: number | null): string {
  return rate === null ? 'n/a' : `${(rate * 100).toFixed(1)}%`;
}

function formatMs(milliseconds: number | null): string {
  return milliseconds === null ? 'n/a' : `${(milliseconds / 1000).toFixed(1)} s`;
}

/** The report as Markdown, rendered from the JSON (AGENTS.md 2.6): same numbers, for a reader. */
export function renderEvalReportMarkdown(report: EvalReport): string {
  const lines = [
    `# Eval report: ${report.scenarioId}`,
    '',
    `Generated ${report.generatedAt}.`,
    '',
    '## Bugs detected',
    '',
    `${String(report.bugs.detectedCount)} of ${String(report.bugs.expectedCount)} (${formatRate(report.bugs.detectionRate)}).`,
    '',
    '| Bug | Found | By |',
    '| --- | --- | --- |',
    ...report.bugs.results.map(
      (bug) => `| ${bug.bugId} | ${bug.isDetected ? 'yes' : 'no'} | ${bug.evidence ?? ''} |`,
    ),
    '',
    '## Spoke responses',
    '',
    `${String(report.spokes.okResponses)} of ${String(report.spokes.attempts)} attempts answered with a valid result (${formatRate(report.spokes.validResponseRate)}); ${String(report.spokes.errorResponses)} answered with an error, ${String(report.spokes.unanswered)} never answered, ${String(report.spokes.retriedTaskCount)} task(s) needed a retry.`,
    '',
    '| Spoke | Attempts | Valid | Error | Unanswered | Time |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.spokes.bySpoke.map(
      (spoke) =>
        `| ${spoke.spokeId} | ${String(spoke.attempts)} | ${String(spoke.okResponses)} | ${String(spoke.errorResponses)} | ${String(spoke.unanswered)} | ${formatMs(spoke.totalDurationMs)} |`,
    ),
    '',
    '## Selector stability',
    '',
    `${String(report.selectors.elementCount)} registered element(s), mean stability ${report.selectors.meanStabilityScore === null ? 'n/a' : report.selectors.meanStabilityScore.toFixed(2)}, ${String(report.selectors.fragileCount)} with a fragile primary locator.`,
    '',
    '## Duration',
    '',
    `Spokes ran for ${formatMs(report.duration.spokeSpanMs)} from the first dispatch to the last answer.`,
    '',
    `Not measured: ${report.notMeasured.join(', ')}. The engine reads no host transcript, so it has no true figure for them.`,
    '',
  ];
  return lines.join('\n');
}
