// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { ReviewAssertionSchema, ReviewSchema, ReviewWaiverSchema } from './review.js';

const REVIEW = {
  testCaseId: 'login',
  specPath: 'tests/qa/generated/login.spec.ts',
  specSha256: 'a'.repeat(64),
  verdict: 'rejected',
  reasons: ['a2 asserts a literal.'],
  createdAt: '2026-10-17T09:00:00Z',
};

describe('ReviewSchema', () => {
  it('accepts a review and defaults the schema version and the waivers', () => {
    const review = ReviewSchema.parse(REVIEW);

    expect(review.schemaVersion).toBe(1);
    expect(review.waivers).toEqual([]);
  });

  it.each([
    ['no reason', { reasons: [] }],
    ['an empty reason', { reasons: [''] }],
    ['an unknown verdict', { verdict: 'maybe' }],
    ['a case id that could leave the reviews folder', { testCaseId: '../escape' }],
    ['a hash that is not SHA-256', { specSha256: 'abc' }],
  ])('rejects a review with %s', (_name, override) => {
    expect(ReviewSchema.safeParse({ ...REVIEW, ...override }).success).toBe(false);
  });
});

describe('ReviewWaiverSchema and ReviewAssertionSchema', () => {
  it('needs a reason for a waiver and an a<N> id for an assertion', () => {
    expect(
      ReviewWaiverSchema.safeParse({ assertionId: 'a1', code: 'ungrounded-value', reason: '' }).success,
    ).toBe(false);
    expect(
      ReviewWaiverSchema.safeParse({ assertionId: 'first', code: 'ungrounded-value', reason: 'x' }).success,
    ).toBe(false);
    expect(
      ReviewAssertionSchema.safeParse({
        id: 'a1',
        line: 3,
        subject: { kind: 'page' },
        matcher: 'toHaveURL',
        expectedValues: [],
        findings: [],
      }).success,
    ).toBe(true);
  });
});
