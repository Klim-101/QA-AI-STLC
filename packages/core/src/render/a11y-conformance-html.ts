// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { A11yConformanceReport, CriterionConformanceStatus } from '../a11y-conformance.js';
import {
  A11Y_CONFORMANCE_DISCLAIMER,
  CONFORMANCE_STATUS_LABELS,
  formatConformanceTarget,
  formatEvidenceIds,
  formatScanSummary,
} from './a11y-conformance-markdown.js';
import { escapeHtml } from './html-escape.js';

/**
 * Renders the accessibility conformance report (P6-28, ADR-002) as a standalone HTML document, the
 * same content as `renderA11yConformanceMarkdown`. The `a11y-conformance` renderer registered in
 * `html-registry.ts`.
 */
export function renderA11yConformanceHtml(report: A11yConformanceReport): string {
  const title = `Accessibility conformance: ${formatConformanceTarget(report)}`;
  const counts = Object.entries(report.counts)
    .map(([status, count]) => {
      const label = CONFORMANCE_STATUS_LABELS[status as CriterionConformanceStatus];
      return `<tr><td>${escapeHtml(label)}</td><td>${String(count)}</td></tr>`;
    })
    .join('');
  const rows = report.criteria
    .map((criterion) => {
      const name = escapeHtml(`${criterion.criterionId} ${criterion.name}`);
      const label = escapeHtml(CONFORMANCE_STATUS_LABELS[criterion.status]);
      return `<tr><td>${name}</td><td>${escapeHtml(criterion.level)}</td><td>${label}</td><td>${escapeHtml(formatEvidenceIds(criterion))}</td></tr>`;
    })
    .join('');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '</head>',
    '<body>',
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(A11Y_CONFORMANCE_DISCLAIMER)}</p>`,
    `<p>${escapeHtml(formatScanSummary(report))}</p>`,
    `<table><thead><tr><th>Outcome</th><th>Criteria</th></tr></thead><tbody>${counts}</tbody></table>`,
    `<table><thead><tr><th>Criterion</th><th>Level</th><th>Outcome</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table>`,
    '</body>',
    '</html>',
  ].join('\n');
}
