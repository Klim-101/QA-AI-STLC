// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type {
  A11yConformanceReport,
  CriterionConformance,
  CriterionConformanceStatus,
} from '../a11y-conformance.js';

export const A11Y_CONFORMANCE_DISCLAIMER =
  'Automated results alone do not establish conformance. A criterion is marked passed only where ' +
  'axe-core can decide the whole criterion; every criterion marked needs manual check must be ' +
  'verified by a person before any conformance claim is made.';

export const CONFORMANCE_STATUS_LABELS: Readonly<Record<CriterionConformanceStatus, string>> = {
  passed: 'passed',
  failed: 'failed',
  'needs-manual-check': 'needs manual check',
  'not-applicable': 'not applicable',
  excepted: 'excepted',
};

export function formatConformanceTarget(report: A11yConformanceReport): string {
  return `WCAG ${report.wcagVersion} level ${report.level}`;
}

export function formatScanSummary(report: A11yConformanceReport): string {
  const scans = `${String(report.scanCount)} accessibility scan(s) recorded for this target.`;
  if (report.ignoredScanCount === 0) {
    return scans;
  }
  return `${scans} ${String(report.ignoredScanCount)} scan(s) recorded under a different version or level were ignored.`;
}

export function formatEvidenceIds(criterion: CriterionConformance): string {
  return criterion.evidenceIds.length === 0 ? '—' : criterion.evidenceIds.join(', ');
}

/**
 * Renders the accessibility conformance report (P6-28, ADR-002) as a Markdown section: the
 * mandatory "automated results are not conformance" statement, a count per outcome and one row per
 * in-scope success criterion. The `a11y-conformance` renderer registered in `markdown-registry.ts`.
 */
export function renderA11yConformanceMarkdown(report: A11yConformanceReport): string {
  const counts = Object.entries(report.counts).map(
    ([status, count]) =>
      `| ${CONFORMANCE_STATUS_LABELS[status as CriterionConformanceStatus]} | ${String(count)} |`,
  );
  const rows = report.criteria.map(
    (criterion) =>
      `| ${criterion.criterionId} ${criterion.name} | ${criterion.level} | ${CONFORMANCE_STATUS_LABELS[criterion.status]} | ${formatEvidenceIds(criterion)} |`,
  );
  const sections = [
    `## Accessibility conformance: ${formatConformanceTarget(report)}`,
    A11Y_CONFORMANCE_DISCLAIMER,
    formatScanSummary(report),
    ['| Outcome | Criteria |', '| --- | --- |', ...counts].join('\n'),
    ['| Criterion | Level | Outcome | Evidence |', '| --- | --- | --- | --- |', ...rows].join('\n'),
  ];
  return `${sections.join('\n\n')}\n`;
}
