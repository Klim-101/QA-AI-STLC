// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { DefectDraft, SecurityFinding } from '@qa-ai-stlc/schemas';

export interface SecurityFindingDraftOptions {
  readonly environment: string;
  /** Registered evidence that shows the finding, normally the audit result and the evidence it links. */
  readonly evidencePaths: readonly string[];
  readonly createdAt: string;
}

/**
 * Turns an audit finding into a tracker-neutral defect draft with `category: security`. The draft
 * enters the same acceptance gate and RCA flow as any other defect; nothing is accepted here.
 */
export function securityFindingToDefectDraft(
  finding: SecurityFinding,
  options: SecurityFindingDraftOptions,
): DefectDraft {
  return {
    schemaVersion: 1,
    id: `security-${finding.id}`,
    title: finding.title,
    severityProposal: finding.severityProposal,
    category: 'security',
    steps: finding.steps,
    expectedResult: finding.expectedResult,
    actualResult: finding.actualResult,
    environment: options.environment,
    requirementIds: [],
    evidencePaths: [...options.evidencePaths],
    status: 'draft',
    createdAt: options.createdAt,
    securityRiskArea: finding.riskArea,
    securityConfidence: finding.confidence,
    securitySuggestedRemediation: finding.remediation,
    securityRegressionCheck: finding.regressionCheck,
  };
}
