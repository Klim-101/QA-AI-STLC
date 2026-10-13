// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { InteractiveResultRow, InteractiveResultsSummary } from '../interactive-results-summary.js';

/**
 * Renders the results registered by live case execution (`qa-execute`) as Markdown: a count per
 * status and one row per case. The `interactive-results-summary` renderer registered in
 * `markdown-registry.ts`; its origin is stated in the heading so it is never read as a `qa run`.
 */
export function renderInteractiveResultsSummaryMarkdown(summary: InteractiveResultsSummary): string {
  const heading =
    summary.runId === undefined ? '# Live execution results' : `# Live execution results: ${summary.runId}`;
  const counts = [
    '## Results',
    '',
    '| Status | Cases |',
    '| --- | --- |',
    ...Object.entries(summary.counts).map(([status, count]) => `| ${status} | ${String(count)} |`),
  ].join('\n');
  const cases = [
    '## Cases',
    '',
    '| Case | Type | Status | Finished | Evidence | Results |',
    '| --- | --- | --- | --- | --- | --- |',
    ...summary.rows.map(renderRow),
  ].join('\n');
  const failures = summary.rows.flatMap((row) =>
    row.failureMessage === undefined ? [] : [`- ${row.testCaseId}: ${row.failureMessage}`],
  );

  const sections = [
    heading,
    'Results registered by interactive case execution, not by `qa run`. One row per case: its latest result.',
    counts,
    cases,
    ...(failures.length === 0 ? [] : ['## Failures', failures.join('\n')]),
  ];
  return `${sections.join('\n\n')}\n`;
}

function renderRow(row: InteractiveResultRow): string {
  return `| ${row.testCaseId} | ${row.testType} | ${row.status} | ${row.finishedAt} | ${String(row.evidenceCount)} | ${String(row.resultCount)} |`;
}
