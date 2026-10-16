// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunResultReport } from '../run-result-report.js';

/**
 * Renders a run-result report as Markdown (AGENTS.md 2.6): summary, case table, failure reasons,
 * spec runs, accessibility summary, defects and approved RCAs. A section with nothing to show is
 * left out; every status keeps its own name (`blocked`, `skipped`, `uncertain` and `partial` are
 * never folded into passed or failed), and evidence is counted, never inlined. The
 * `run-result-report` renderer registered in `markdown-registry.ts`.
 */
export function renderRunResultReportMarkdown(report: RunResultReport): string {
  const sections: (string | undefined)[] = [
    '# Run result report',
    renderSummary(report),
    renderCases(report),
    renderFailures(report),
    renderSpecRuns(report),
    renderAccessibility(report),
    renderDefects(report),
    renderRcas(report),
  ];
  return `${sections.filter((section) => section !== undefined).join('\n\n')}\n`;
}

function countsTable(unit: string, counts: Readonly<Record<string, number>>): string {
  return [
    `| Status | ${unit} |`,
    '| --- | --- |',
    ...Object.entries(counts).map(([status, count]) => `| ${status} | ${String(count)} |`),
  ].join('\n');
}

function renderSummary(report: RunResultReport): string | undefined {
  if (report.caseCounts === undefined) {
    return undefined;
  }
  return ['## Summary', '', countsTable('Cases', report.caseCounts)].join('\n');
}

function renderCases(report: RunResultReport): string | undefined {
  if (report.cases.length === 0) {
    return undefined;
  }
  return [
    '## Cases',
    '',
    'One row per case: its latest result.',
    '',
    '| Case | Type | Status | Finished | Evidence | Result |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.cases.map(
      (row) =>
        `| ${row.testCaseId} | ${row.testType} | ${row.status} | ${row.finishedAt} | ${String(row.evidenceCount)} | ${row.resultId} |`,
    ),
  ].join('\n');
}

function renderFailures(report: RunResultReport): string | undefined {
  const failures = report.cases.flatMap((row) =>
    row.failureMessage === undefined ? [] : [`- ${row.testCaseId} (${row.status}): ${row.failureMessage}`],
  );
  return failures.length === 0 ? undefined : ['## Failure reasons', '', ...failures].join('\n');
}

function renderSpecRuns(report: RunResultReport): string | undefined {
  if (report.specRuns.length === 0) {
    return undefined;
  }
  return [
    '## Spec runs',
    '',
    'Executions of generated specs with `qa run`.',
    '',
    '| Run | Type | Started | Finished | Specs | Results by status |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.specRuns.map((run) => {
      const byStatus = Object.entries(run.counts)
        .map(([status, count]) => `${status} ${String(count)}`)
        .join(', ');
      return `| ${run.runId} | ${run.testType} | ${run.startedAt} | ${run.finishedAt} | ${String(run.specFileCount)} | ${byStatus} |`;
    }),
  ].join('\n');
}

function renderAccessibility(report: RunResultReport): string | undefined {
  const a11y = report.accessibility;
  if (a11y === undefined) {
    return undefined;
  }
  return [
    '## Accessibility',
    '',
    `WCAG ${a11y.wcagVersion} level ${a11y.level}, ${String(a11y.scanCount)} scan(s). Automated results alone do not establish conformance.`,
    '',
    countsTable('Criteria', a11y.counts),
  ].join('\n');
}

function renderDefects(report: RunResultReport): string | undefined {
  if (report.defects.length === 0) {
    return undefined;
  }
  return [
    '## Defects',
    '',
    '| Defect | Title | Severity (proposed) | Category | Status |',
    '| --- | --- | --- | --- | --- |',
    ...report.defects.map(
      (defect) =>
        `| ${defect.id} | ${defect.title} | ${defect.severityProposal} | ${defect.category} | ${defect.status} |`,
    ),
  ].join('\n');
}

function bullets(items: readonly string[]): string[] {
  return items.map((item) => `- ${item}`);
}

function renderRcas(report: RunResultReport): string | undefined {
  if (report.approvedRcas.length === 0 && report.unapprovedRcaCount === 0) {
    return undefined;
  }
  const approved = report.approvedRcas.flatMap((rca) => [
    '',
    `### ${rca.defectId}`,
    '',
    '**Facts**',
    '',
    ...bullets(rca.facts),
    '',
    '**Hypotheses**',
    '',
    ...bullets(
      rca.hypotheses.map((hypothesis) => `${hypothesis.description} (confidence: ${hypothesis.confidence})`),
    ),
    ...(rca.remediation.length === 0 ? [] : ['', '**Remediation**', '', ...bullets(rca.remediation)]),
  ]);
  const unapproved =
    report.unapprovedRcaCount === 0
      ? []
      : ['', `${String(report.unapprovedRcaCount)} root cause analysis(es) not approved are left out.`];
  return ['## Root cause analysis', ...approved, ...unapproved].join('\n');
}
