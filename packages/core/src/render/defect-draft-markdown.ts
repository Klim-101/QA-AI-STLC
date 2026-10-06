// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { DefectDraft } from '@qa-ai-stlc/schemas';

/**
 * Renders a `DefectDraftSchema` artifact as tracker-neutral Markdown (ADR-002): the operator
 * pastes or attaches it in their own tracker, so it carries no tracker field names, keys or
 * markup. The `defect-draft` renderer registered in `markdown-registry.ts`.
 */
export function renderDefectDraftMarkdown(defect: DefectDraft): string {
  const sections: string[] = [`# ${defect.title}`, renderMetadata(defect)];

  sections.push(['## Steps to reproduce', '', renderNumberedList(defect.steps)].join('\n'));
  sections.push(['## Expected result', '', defect.expectedResult].join('\n'));
  sections.push(['## Actual result', '', defect.actualResult].join('\n'));

  if (defect.category === 'security') {
    const security = renderSecurity(defect);
    if (security !== undefined) {
      sections.push(security);
    }
  }

  if (defect.evidencePaths.length > 0) {
    sections.push(
      ['## Evidence', '', defect.evidencePaths.map((path) => `- \`${path}\``).join('\n')].join('\n'),
    );
  }

  return `${sections.join('\n\n')}\n`;
}

function renderMetadata(defect: DefectDraft): string {
  const rows = [
    `**Id:** ${defect.id}`,
    `**Proposed severity:** ${defect.severityProposal}`,
    `**Category:** ${defect.category}`,
    `**Environment:** ${defect.environment}`,
    ...(defect.requirementIds.length > 0 ? [`**Requirements:** ${defect.requirementIds.join(', ')}`] : []),
    `**Status:** ${defect.status}`,
  ];
  return rows.join('\n');
}

function renderSecurity(defect: DefectDraft): string | undefined {
  const rows = [
    ...(defect.securityRiskArea !== undefined ? [`**Risk area:** ${defect.securityRiskArea}`] : []),
    ...(defect.securityConfidence !== undefined ? [`**Confidence:** ${defect.securityConfidence}`] : []),
    ...(defect.securitySuggestedRemediation !== undefined
      ? [`**Suggested remediation:** ${defect.securitySuggestedRemediation}`]
      : []),
    ...(defect.securityRegressionCheck !== undefined
      ? [`**Regression check:** ${defect.securityRegressionCheck}`]
      : []),
  ];
  return rows.length === 0 ? undefined : ['## Security assessment', '', ...rows].join('\n');
}

function renderNumberedList(items: readonly string[]): string {
  return items.map((item, index) => `${String(index + 1)}. ${item}`).join('\n');
}
