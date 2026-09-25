// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseSummary, FeatureCaseIndex } from '@qa-ai-stlc/schemas';

/**
 * Renders a feature's steps-free case index (#357) as a presentable Markdown document: one section
 * per case with its type and the requirement(s) it covers, no steps. The `case-index` renderer
 * registered in `markdown-registry.ts`.
 */
export function renderCaseIndexMarkdown(index: FeatureCaseIndex): string {
  const sections: string[] = [`# Test cases: ${index.feature}`];

  if (index.cases.length === 0) {
    sections.push('No test cases registered for this feature yet.');
    return `${sections.join('\n\n')}\n`;
  }

  sections.push(...index.cases.map(renderCaseSummary));
  return `${sections.join('\n\n')}\n`;
}

function renderCaseSummary(caseSummary: CaseSummary): string {
  const rows = [
    `## ${caseSummary.title}`,
    `**Id:** ${caseSummary.id}`,
    `**Test type:** ${caseSummary.testType}`,
    `**Requirements:** ${caseSummary.requirementIds.join(', ')}`,
  ];
  if (caseSummary.description !== undefined) {
    rows.push(`**Description:** ${caseSummary.description}`);
  }
  return rows.join('\n');
}
