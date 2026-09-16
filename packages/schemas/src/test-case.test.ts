// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { TestCaseSchema } from './test-case.js';

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
