// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { TraceabilityCase, TraceabilityMatrix, TraceabilityRequirement } from '../traceability.js';
import { escapeHtml } from './html-escape.js';

/**
 * Renders the requirement → case → result → evidence traceability matrix (P3-08, ADR-002) as a
 * standalone HTML document, the same content as `renderTraceabilityMatrixMarkdown` in an HTML
 * shape. The `traceability-matrix` renderer registered in `html-registry.ts`.
 */
export function renderTraceabilityMatrixHtml(matrix: TraceabilityMatrix): string {
  const body =
    matrix.requirements.length === 0
      ? '<p>No requirements recorded yet.</p>'
      : matrix.requirements.map(renderRequirementSection).join('\n');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Traceability matrix</title>',
    '</head>',
    '<body>',
    '<h1>Traceability matrix</h1>',
    `<p><strong>Generated:</strong> ${escapeHtml(matrix.generatedAt)}</p>`,
    body,
    '</body>',
    '</html>',
  ].join('\n');
}

function renderRequirementSection(requirement: TraceabilityRequirement): string {
  const heading = `<h2>${escapeHtml(requirement.title)} (${escapeHtml(requirement.requirementId)})</h2>`;
  if (requirement.cases.length === 0) {
    return [heading, '<p>No linked test cases.</p>'].join('\n');
  }
  const rows = requirement.cases.map(renderCaseRow).join('');
  return [
    heading,
    `<table><thead><tr><th>Case</th><th>Status</th><th>Result</th><th>Evidence</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>`,
  ].join('\n');
}

function renderCaseRow(testCase: TraceabilityCase): string {
  const result = testCase.latestResult;
  const status = result?.status ?? 'never run';
  const resultId = result?.resultId ?? '—';
  const evidenceCount = result?.evidenceIds.length ?? 0;
  return (
    `<tr><td>${escapeHtml(testCase.title)} (${escapeHtml(testCase.testCaseId)})</td>` +
    `<td>${escapeHtml(status)}</td><td>${escapeHtml(resultId)}</td><td>${String(evidenceCount)}</td></tr>`
  );
}
