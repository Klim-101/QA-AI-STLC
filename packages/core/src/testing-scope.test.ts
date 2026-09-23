// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SCHEMA_VERSION, type TestCase, type TestingScope } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { checkCaseSetCompleteness, findUndecidedTestingTypes } from './testing-scope.js';

const DECIDED: TestingScope = {
  e2e: 'in-scope',
  api: 'out-of-scope',
  a11y: 'out-of-scope',
  security: 'out-of-scope',
};

function testCase(overrides: Partial<TestCase>): TestCase {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'case-1',
    feature: 'checkout',
    requirementIds: ['r1'],
    testType: 'e2e',
    title: 'A case',
    steps: [{ description: 'Do something' }],
    expectedResult: 'Something happens',
    status: 'draft',
    createdAt: '2026-09-20T12:00:00Z',
    ...overrides,
  };
}

describe('findUndecidedTestingTypes', () => {
  it('returns an empty list when every type is decided', () => {
    expect(findUndecidedTestingTypes(DECIDED)).toEqual([]);
  });

  it('returns every undecided type, in declared field order', () => {
    const testing: TestingScope = { ...DECIDED, api: 'undecided', a11y: 'undecided' };

    expect(findUndecidedTestingTypes(testing)).toEqual(['api', 'a11y']);
  });

  it('returns all four types when nothing has been decided', () => {
    const testing: TestingScope = {
      e2e: 'undecided',
      api: 'undecided',
      a11y: 'undecided',
      security: 'undecided',
    };

    expect(findUndecidedTestingTypes(testing)).toEqual(['e2e', 'api', 'a11y', 'security']);
  });
});

describe('checkCaseSetCompleteness', () => {
  it('marks an in-scope type with a registered case as satisfied', () => {
    const { statusByType } = checkCaseSetCompleteness(DECIDED, [testCase({ testType: 'e2e' })]);

    expect(statusByType.e2e).toBe('satisfied');
  });

  it('marks an in-scope type with no registered case as missing', () => {
    const { statusByType } = checkCaseSetCompleteness(DECIDED, []);

    expect(statusByType.e2e).toBe('missing');
  });

  it('marks a non-in-scope type as not-applicable regardless of registered cases', () => {
    const { statusByType } = checkCaseSetCompleteness(DECIDED, []);

    expect(statusByType.api).toBe('not-applicable');
    expect(statusByType.a11y).toBe('not-applicable');
  });

  it('reports a type with a registered case even though it is not in scope', () => {
    const { outOfScopeTypes } = checkCaseSetCompleteness(DECIDED, [testCase({ testType: 'api' })]);

    expect(outOfScopeTypes).toEqual(['api']);
  });

  it('never reports security: it has no case-bearing type at all', () => {
    const { statusByType, outOfScopeTypes } = checkCaseSetCompleteness(DECIDED, []);

    expect(statusByType).not.toHaveProperty('security');
    expect(outOfScopeTypes).not.toContain('security');
  });

  it('reports every in-scope type satisfied and no out-of-scope cases when fully complete', () => {
    const testing: TestingScope = {
      e2e: 'in-scope',
      api: 'in-scope',
      a11y: 'in-scope',
      security: 'in-scope',
    };
    const cases = [
      testCase({ testType: 'e2e' }),
      testCase({ id: 'case-2', testType: 'api' }),
      testCase({ id: 'case-3', testType: 'a11y' }),
    ];

    const { statusByType, outOfScopeTypes } = checkCaseSetCompleteness(testing, cases);

    expect(statusByType).toEqual({ e2e: 'satisfied', api: 'satisfied', a11y: 'satisfied' });
    expect(outOfScopeTypes).toEqual([]);
  });
});
