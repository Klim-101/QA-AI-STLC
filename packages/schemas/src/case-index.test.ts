// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { CasesIndexSchema, FeatureCaseIndexSchema } from './case-index.js';

describe('FeatureCaseIndexSchema', () => {
  it('accepts an index with a mix of cases, including one without a description', () => {
    const result = FeatureCaseIndexSchema.safeParse({
      feature: 'checkout',
      cases: [
        {
          id: 'case-1',
          title: 'User can complete checkout',
          testType: 'e2e',
          requirementIds: ['r1'],
          description: 'Happy-path checkout with a valid card',
        },
        {
          id: 'case-2',
          title: 'Checkout rejects an expired card',
          testType: 'e2e',
          requirementIds: ['r1', 'r2'],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('accepts an empty case list', () => {
    const result = FeatureCaseIndexSchema.safeParse({ feature: 'checkout', cases: [] });

    expect(result.success).toBe(true);
  });

  it('rejects a case summary with no requirement ids', () => {
    const result = FeatureCaseIndexSchema.safeParse({
      feature: 'checkout',
      cases: [{ id: 'case-1', title: 'A case', testType: 'e2e', requirementIds: [] }],
    });

    expect(result.success).toBe(false);
  });
});

describe('CasesIndexSchema', () => {
  it('accepts a list of file hashes', () => {
    const result = CasesIndexSchema.safeParse({
      files: [
        { path: 'artifacts/cases/checkout/case-1.json', sha256: 'a'.repeat(64) },
        { path: 'artifacts/cases/checkout/case-2.json', sha256: 'b'.repeat(64) },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('accepts an empty case set', () => {
    const result = CasesIndexSchema.safeParse({ files: [] });

    expect(result.success).toBe(true);
  });

  it('rejects a hash that is not a lowercase 64-character hex digest', () => {
    const result = CasesIndexSchema.safeParse({
      files: [{ path: 'artifacts/cases/checkout/case-1.json', sha256: 'not-a-hash' }],
    });

    expect(result.success).toBe(false);
  });
});
