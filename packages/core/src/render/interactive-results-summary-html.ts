// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { InteractiveResultRow, InteractiveResultsSummary } from '../interactive-results-summary.js';
import { escapeHtml } from './html-escape.js';

/**
 * Renders the results registered by live case execution as a standalone HTML document, the same
 * content as `renderInteractiveResultsSummaryMarkdown`. The `interactive-results-summary` renderer
 * registered in `html-registry.ts`.
 */
export function renderInteractiveResultsSummaryHtml(summary: InteractiveResultsSummary): string {
  const title =
    summary.runId === undefined
      ? 'Live execution results'
      : `Live execution results: ${escapeHtml(summary.runId)}`;
  const countRows = Object.entries(summary.counts)
    .map(([status, count]) => `<tr><td>${escapeHtml(status)}</td><td>${String(count)}</td></tr>`)
    .join('');
  const caseRows = summary.rows.map(renderRow).join('');
  const failures = summary.rows
    .flatMap((row) =>
      row.failureMessage === undefined
        ? []
        : [`<li>${escapeHtml(row.testCaseId)}: ${escapeHtml(row.failureMessage)}</li>`],
    )
    .join('');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    '</head>',
    '<body>',
    `<h1>${title}</h1>`,
    '<p>Results registered by interactive case execution, not by <code>qa run</code>. One row per case: its latest result.</p>',
    '<h2>Results</h2>',
    `<table><thead><tr><th>Status</th><th>Cases</th></tr></thead><tbody>${countRows}</tbody></table>`,
    '<h2>Cases</h2>',
    `<table><thead><tr><th>Case</th><th>Type</th><th>Status</th><th>Finished</th><th>Evidence</th><th>Results</th></tr></thead><tbody>${caseRows}</tbody></table>`,
    ...(failures === '' ? [] : ['<h2>Failures</h2>', `<ul>${failures}</ul>`]),
    '</body>',
    '</html>',
  ].join('\n');
}

function renderRow(row: InteractiveResultRow): string {
  return `<tr><td>${escapeHtml(row.testCaseId)}</td><td>${escapeHtml(row.testType)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.finishedAt)}</td><td>${String(row.evidenceCount)}</td><td>${String(row.resultCount)}</td></tr>`;
}
