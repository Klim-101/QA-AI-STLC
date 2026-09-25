// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunRecord } from '@qa-ai-stlc/schemas';
import { escapeHtml } from './html-escape.js';

/**
 * Renders a `RunRecordSchema` artifact as a standalone HTML document (P3-08, ADR-002), the same
 * content as `renderRunSummaryMarkdown` in an HTML shape an operator can open directly in a
 * browser. The `run-summary` renderer registered under `'run-summary'` in `html-registry.ts`.
 */
export function renderRunSummaryHtml(runRecord: RunRecord): string {
  const rows = Object.entries(runRecord.counts)
    .map(([status, count]) => `<tr><td>${escapeHtml(status)}</td><td>${String(count)}</td></tr>`)
    .join('');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>Run summary: ${escapeHtml(runRecord.id)}</title>`,
    '</head>',
    '<body>',
    `<h1>Run summary: ${escapeHtml(runRecord.id)}</h1>`,
    '<ul>',
    `<li><strong>Test type:</strong> ${escapeHtml(runRecord.testType)}</li>`,
    `<li><strong>Base URL:</strong> ${escapeHtml(runRecord.baseUrl)}</li>`,
    `<li><strong>Started:</strong> ${escapeHtml(runRecord.startedAt)}</li>`,
    `<li><strong>Finished:</strong> ${escapeHtml(runRecord.finishedAt)}</li>`,
    `<li><strong>Spec files:</strong> ${escapeHtml(runRecord.specFiles.join(', '))}</li>`,
    '</ul>',
    '<h2>Results</h2>',
    `<table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table>`,
    '</body>',
    '</html>',
  ].join('\n');
}
