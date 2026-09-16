// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { DefectDraftSchema } from './defect.js';

function baseDefect() {
  return {
    id: 'defect-1',
    title: 'Submit button does nothing on the checkout form',
    severityProposal: 'major',
    category: 'functional',
    steps: ['Open the checkout form', 'Fill in valid data', 'Click submit'],
    expectedResult: 'The order is placed and a confirmation is shown',
    actualResult: 'Nothing happens; no network request is sent',
    environment: 'staging',
    requirementIds: ['req-12'],
    evidencePaths: ['evidence/run-1/checkout-submit.png'],
    status: 'draft',
    createdAt: '2026-09-16T12:00:00Z',
  };
}

describe('DefectDraftSchema', () => {
  it('accepts a functional defect with no security fields', () => {
    const result = DefectDraftSchema.safeParse(baseDefect());
    expect(result.success).toBe(true);
  });

  it('accepts a security defect with security fields populated', () => {
    const defect = {
      ...baseDefect(),
      category: 'security',
      securityRiskArea: 'authorization',
      securityConfidence: 'high',
    };
    const result = DefectDraftSchema.safeParse(defect);
    expect(result.success).toBe(true);
  });

  it('rejects security fields on a non-security defect', () => {
    const defect = { ...baseDefect(), securityRiskArea: 'authorization' };
    const result = DefectDraftSchema.safeParse(defect);
    expect(result.success).toBe(false);
  });

  it('rejects an empty steps list', () => {
    const defect = { ...baseDefect(), steps: [] };
    const result = DefectDraftSchema.safeParse(defect);
    expect(result.success).toBe(false);
  });

  it('rejects an evidence path outside the project', () => {
    const defect = { ...baseDefect(), evidencePaths: ['../outside/evidence.png'] };
    const result = DefectDraftSchema.safeParse(defect);
    expect(result.success).toBe(false);
  });
});
