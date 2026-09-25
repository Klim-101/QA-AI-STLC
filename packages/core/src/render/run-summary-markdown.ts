// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunRecord } from '@qa-ai-stlc/schemas';

/**
 * Renders a `RunRecordSchema` artifact as a presentable Markdown summary (P3-08, ADR-002):
 * metadata and a per-status result count table. The `run-summary` renderer registered under
 * `'run-summary'` in `markdown-registry.ts`.
 */
export function renderRunSummaryMarkdown(runRecord: RunRecord): string {
  const sections: string[] = [`# Run summary: ${runRecord.id}`];

  sections.push(
    [
      `**Test type:** ${runRecord.testType}`,
      `**Base URL:** ${runRecord.baseUrl}`,
      `**Started:** ${runRecord.startedAt}`,
      `**Finished:** ${runRecord.finishedAt}`,
      `**Spec files:** ${runRecord.specFiles.join(', ')}`,
    ].join('\n'),
  );

  sections.push(['## Results', '', renderCountsTable(runRecord.counts)].join('\n'));

  return `${sections.join('\n\n')}\n`;
}

function renderCountsTable(counts: RunRecord['counts']): string {
  const rows = Object.entries(counts).map(([status, count]) => `| ${status} | ${String(count)} |`);
  return ['| Status | Count |', '| --- | --- |', ...rows].join('\n');
}
