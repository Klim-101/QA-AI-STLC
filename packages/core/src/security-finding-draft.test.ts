// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { DefectDraftSchema, type SecurityFinding } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { securityFindingToDefectDraft } from './security-finding-draft.js';

const FINDING: SecurityFinding = {
  id: 'cookies-1',
  checkClass: 'cookies',
  riskArea: 'Session management',
  confidence: 'high',
  severityProposal: 'major',
  title: 'Session cookie is readable from scripts',
  steps: ['Sign in', 'Read the Set-Cookie header of the response'],
  expectedResult: 'The session cookie carries HttpOnly',
  actualResult: 'The session cookie has no HttpOnly attribute',
  remediation: 'Set HttpOnly on the session cookie',
  regressionCheck: 'Assert the sign-in response sets HttpOnly',
  requestIndexes: [0],
};

describe('securityFindingToDefectDraft', () => {
  it('builds a schema-valid security draft that is not yet accepted', () => {
    const draft = securityFindingToDefectDraft(FINDING, {
      environment: 'staging',
      evidencePaths: ['evidence/security-1/audit-1.json'],
      createdAt: '2026-10-10T10:00:00Z',
    });

    expect(DefectDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft).toMatchObject({
      id: 'security-cookies-1',
      category: 'security',
      status: 'draft',
      environment: 'staging',
      requirementIds: [],
      evidencePaths: ['evidence/security-1/audit-1.json'],
      securityRiskArea: 'Session management',
      securityConfidence: 'high',
      securitySuggestedRemediation: 'Set HttpOnly on the session cookie',
      securityRegressionCheck: 'Assert the sign-in response sets HttpOnly',
    });
  });

  it('copies the evidence list instead of sharing it with the caller', () => {
    const evidencePaths = ['evidence/security-1/audit-1.json'];

    const draft = securityFindingToDefectDraft(FINDING, {
      environment: 'staging',
      evidencePaths,
      createdAt: '2026-10-10T10:00:00Z',
    });
    evidencePaths.push('evidence/other.json');

    expect(draft.evidencePaths).toEqual(['evidence/security-1/audit-1.json']);
  });
});
