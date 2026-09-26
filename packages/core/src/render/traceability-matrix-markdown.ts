// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { TraceabilityCase, TraceabilityMatrix, TraceabilityRequirement } from '../traceability.js';

/**
 * Renders the requirement → case → result → evidence traceability matrix (P3-08, ADR-002) as a
 * presentable Markdown document: one section per requirement, with a table of its linked cases'
 * latest result. The `traceability-matrix` renderer registered in `markdown-registry.ts`.
 */
export function renderTraceabilityMatrixMarkdown(matrix: TraceabilityMatrix): string {
  const sections: string[] = ['# Traceability matrix', `**Generated:** ${matrix.generatedAt}`];

  if (matrix.requirements.length === 0) {
    sections.push('No requirements recorded yet.');
    return `${sections.join('\n\n')}\n`;
  }

  sections.push(...matrix.requirements.map(renderRequirementSection));
  return `${sections.join('\n\n')}\n`;
}

function renderRequirementSection(requirement: TraceabilityRequirement): string {
  const heading = `## ${requirement.title} (${requirement.requirementId})`;
  if (requirement.cases.length === 0) {
    return [heading, 'No linked test cases.'].join('\n\n');
  }
  const rows = requirement.cases.map(renderCaseRow);
  return [
    heading,
    '| Case | Status | Result | Evidence | Flaky |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function renderCaseRow(testCase: TraceabilityCase): string {
  const result = testCase.latestResult;
  const status = result?.status ?? 'never run';
  const resultId = result?.resultId ?? '—';
  const evidenceCount = result?.evidenceIds.length ?? 0;
  const flaky = testCase.flaky ? 'yes' : 'no';
  return `| ${testCase.title} (${testCase.testCaseId}) | ${status} | ${resultId} | ${String(evidenceCount)} | ${flaky} |`;
}
