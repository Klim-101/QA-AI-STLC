// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { RcaInputSchema } from './rca-input.js';

const INPUT = {
  defect: {
    id: 'login-error',
    title: 'No error shown',
    severityProposal: 'major',
    category: 'functional',
    steps: ['Open the login page'],
    expectedResult: 'An error is shown',
    actualResult: 'Nothing is shown',
    environment: 'staging',
    requirementIds: [],
    evidencePaths: [],
    status: 'accepted',
    createdAt: '2026-10-07T12:00:00Z',
  },
  defectSha256: 'a'.repeat(64),
  cases: [],
  results: [],
  omittedResultCount: 0,
  evidence: [],
  source: { isConfigured: false },
};

describe('RcaInputSchema', () => {
  it('accepts the input the engine builds for an accepted defect', () => {
    expect(RcaInputSchema.safeParse(INPUT).success).toBe(true);
  });

  it('accepts a configured source with its path and evidence with an excerpt', () => {
    const result = RcaInputSchema.safeParse({
      ...INPUT,
      source: { isConfigured: true, path: 'app/src' },
      evidence: [
        {
          path: 'evidence/run-1/console-1.log',
          sha256: 'b'.repeat(64),
          sizeBytes: 10,
          excerpt: 'text',
          isTruncated: false,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a defect hash that is not a SHA-256', () => {
    expect(RcaInputSchema.safeParse({ ...INPUT, defectSha256: 'nope' }).success).toBe(false);
  });
});
