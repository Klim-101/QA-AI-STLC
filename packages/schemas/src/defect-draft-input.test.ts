// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { DefectDraftSchema } from './defect.js';
import { DefectDraftInputSchema } from './defect-draft-input.js';

describe('DefectDraftInputSchema', () => {
  it('accepts an input with no seed, and defaults the schema version', () => {
    expect(DefectDraftInputSchema.parse({ runId: 'run-1', seeds: [] }).schemaVersion).toBe(1);
  });

  it('rejects a run id that could name a path', () => {
    expect(DefectDraftInputSchema.safeParse({ runId: '../x', seeds: [] }).success).toBe(false);
  });
});

describe('DefectDraftSchema source', () => {
  const DRAFT = {
    id: 'greeting-empty',
    title: 'No name',
    severityProposal: 'major',
    category: 'functional',
    steps: ['Open'],
    expectedResult: 'A name',
    actualResult: 'None',
    environment: 'staging',
    requirementIds: [],
    evidencePaths: [],
    status: 'draft',
    createdAt: '2026-10-17T10:00:00Z',
  };

  it('is optional and, when given, names the run and the result', () => {
    expect(DefectDraftSchema.safeParse(DRAFT).success).toBe(true);
    expect(
      DefectDraftSchema.safeParse({ ...DRAFT, source: { runId: 'run-1', resultId: 'r1' } }).success,
    ).toBe(true);
    expect(DefectDraftSchema.safeParse({ ...DRAFT, source: { runId: 'run-1' } }).success).toBe(false);
  });
});
