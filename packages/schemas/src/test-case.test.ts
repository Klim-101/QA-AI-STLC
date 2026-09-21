// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { REGRESSION_TIERS, RegressionTierSchema, TestCaseSchema } from './test-case.js';

describe('TestCaseSchema', () => {
  it('accepts an approved e2e case', () => {
    const result = TestCaseSchema.safeParse({
      id: 'case-1',
      requirementIds: ['req-1'],
      testType: 'e2e',
      title: 'User can complete checkout with valid card details',
      steps: [{ description: 'Add an item to the cart' }, { description: 'Complete checkout' }],
      expectedResult: 'The order confirmation page is shown',
      status: 'approved',
      createdAt: '2026-09-16T12:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a case with no preconditions or regressionTier (P2-17, both optional)', () => {
    const result = TestCaseSchema.safeParse({
      id: 'case-legacy',
      requirementIds: ['req-1'],
      testType: 'e2e',
      title: 'A case written before qa-design-cases existed',
      steps: [{ description: 'Do something' }],
      expectedResult: 'Something happens',
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a case with preconditions and every regressionTier value', () => {
    for (const tier of REGRESSION_TIERS) {
      const result = TestCaseSchema.safeParse({
        id: `case-${tier}`,
        requirementIds: ['req-1'],
        testType: 'e2e',
        title: 'A case with preconditions and a regression tier',
        preconditions: ['The user is logged in', 'The cart is empty'],
        steps: [{ description: 'Do something' }],
        expectedResult: 'Something happens',
        regressionTier: tier,
        status: 'draft',
        createdAt: '2026-09-16T12:00:00Z',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an empty precondition string', () => {
    const result = TestCaseSchema.safeParse({
      id: 'case-empty-precondition',
      requirementIds: ['req-1'],
      testType: 'e2e',
      title: 'A case with a blank precondition',
      preconditions: [''],
      steps: [{ description: 'Do something' }],
      expectedResult: 'Something happens',
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a regressionTier value outside the four ISTQB-aligned tiers', () => {
    const result = RegressionTierSchema.safeParse('nightly');
    expect(result.success).toBe(false);
  });

  it('rejects a case with zero steps', () => {
    const result = TestCaseSchema.safeParse({
      id: 'case-2',
      requirementIds: [],
      testType: 'api',
      title: 'Empty case',
      steps: [],
      expectedResult: 'n/a',
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a case with no linked requirement at all', () => {
    const result = TestCaseSchema.safeParse({
      id: 'case-4',
      requirementIds: [],
      testType: 'e2e',
      title: 'Unlinked case',
      steps: [{ description: 'Do something' }],
      expectedResult: 'Something happens',
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects "security" as a test type, since the audit has no cases of its own', () => {
    const result = TestCaseSchema.safeParse({
      id: 'case-3',
      requirementIds: [],
      testType: 'security',
      title: 'Invalid',
      steps: [{ description: 'n/a' }],
      expectedResult: 'n/a',
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('REGRESSION_TIERS', () => {
  it('orders tiers from narrowest to widest run, smoke first and extended last', () => {
    expect(REGRESSION_TIERS).toEqual(['smoke', 'critical-path', 'regression', 'extended']);
    expect(REGRESSION_TIERS.indexOf('smoke')).toBeLessThan(REGRESSION_TIERS.indexOf('critical-path'));
    expect(REGRESSION_TIERS.indexOf('critical-path')).toBeLessThan(REGRESSION_TIERS.indexOf('regression'));
    expect(REGRESSION_TIERS.indexOf('regression')).toBeLessThan(REGRESSION_TIERS.indexOf('extended'));
  });

  it('matches every value RegressionTierSchema accepts, in the same order', () => {
    expect(RegressionTierSchema.options).toEqual(REGRESSION_TIERS);
  });
});
