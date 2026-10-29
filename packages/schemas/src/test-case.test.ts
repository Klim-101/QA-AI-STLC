// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { REGRESSION_TIERS, RegressionTierSchema, TestCaseSchema } from './test-case.js';

describe('TestCaseSchema', () => {
  it('accepts an approved e2e case', () => {
    const result = TestCaseSchema.safeParse({
      id: 'case-1',
      feature: 'checkout',
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

  it('accepts manual checks and rejects an empty list or an empty check', () => {
    const base = {
      id: 'case-1',
      feature: 'checkout',
      requirementIds: ['req-1'],
      testType: 'e2e',
      title: 'A case with judgement-only checks',
      steps: [{ description: 'Open the page' }],
      expectedResult: 'The page is shown',
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    };

    expect(TestCaseSchema.safeParse({ ...base, manualChecks: ['The layout looks right'] }).success).toBe(
      true,
    );
    expect(TestCaseSchema.safeParse({ ...base, manualChecks: [] }).success).toBe(false);
    expect(TestCaseSchema.safeParse({ ...base, manualChecks: [''] }).success).toBe(false);
  });

  it('accepts a case with no preconditions or regressionTier (P2-17, both optional)', () => {
    const result = TestCaseSchema.safeParse({
      id: 'case-legacy',
      feature: 'checkout',
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
        feature: 'checkout',
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
      feature: 'checkout',
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

  it('accepts a case that references reusable test data by id (P2-22)', () => {
    const result = TestCaseSchema.safeParse({
      id: 'case-with-data',
      feature: 'checkout',
      requirementIds: ['req-1'],
      testType: 'e2e',
      title: 'A case referencing a shared test-data set',
      testDataRefs: ['valid-checkout-card'],
      steps: [{ description: 'Enter the card from {{valid-checkout-card}}' }],
      expectedResult: 'Something happens',
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a case with no feature at all (P2-20)', () => {
    const result = TestCaseSchema.safeParse({
      id: 'case-no-feature',
      requirementIds: ['req-1'],
      testType: 'e2e',
      title: 'A case missing its feature',
      steps: [{ description: 'Do something' }],
      expectedResult: 'Something happens',
      status: 'draft',
      createdAt: '2026-09-16T12:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a feature that is not kebab-case', () => {
    const result = TestCaseSchema.safeParse({
      id: 'case-bad-feature',
      feature: 'Checkout Flow',
      requirementIds: ['req-1'],
      testType: 'e2e',
      title: 'A case with a badly-formed feature',
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
      feature: 'checkout',
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
      feature: 'checkout',
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
      feature: 'checkout',
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

describe('TestCaseSchema endpoints', () => {
  const apiCase = {
    id: 'case-4',
    feature: 'tasks',
    requirementIds: ['req-1'],
    testType: 'api',
    title: 'Get a task',
    steps: [{ description: 'GET the task' }],
    expectedResult: '200',
    status: 'draft',
    createdAt: '2026-09-16T12:00:00Z',
  };

  it('accepts the contract operations an api case exercises', () => {
    const result = TestCaseSchema.safeParse({
      ...apiCase,
      endpoints: [{ method: 'GET', path: '/tasks/{taskId}' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a case with no endpoints, for hand-linked specs', () => {
    expect(TestCaseSchema.safeParse(apiCase).success).toBe(true);
  });

  it.each([
    ['an empty list', []],
    ['a path without a leading slash', [{ method: 'GET', path: 'tasks' }]],
    ['an unsupported method', [{ method: 'TRACE', path: '/tasks' }]],
  ])('rejects %s', (_label, endpoints) => {
    expect(TestCaseSchema.safeParse({ ...apiCase, endpoints }).success).toBe(false);
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

describe('TestCaseSchema structured expectations (ADR-0016)', () => {
  const base = {
    id: 'case-1',
    feature: 'checkout',
    requirementIds: ['req-1'],
    title: 'A case',
    expectedResult: 'It works',
    status: 'approved',
    createdAt: '2026-09-16T12:00:00Z',
  };

  it('accepts step-level and result-level browser expectations on an e2e case', () => {
    const result = TestCaseSchema.safeParse({
      ...base,
      testType: 'e2e',
      steps: [
        {
          description: 'Submit the form',
          expectations: [
            { kind: 'visible', selector: '#done' },
            { kind: 'hidden', selector: '.spinner' },
            { kind: 'text', selector: 'h1', expected: 'Thanks' },
            { kind: 'value', selector: '#email', expected: 'a@example.com' },
            { kind: 'count', selector: 'li', expected: 3 },
            { kind: 'checked', selector: '#terms' },
            { kind: 'checked', selector: '#news', expected: false },
          ],
        },
      ],
      resultExpectations: [{ kind: 'url', expected: 'https://example.com/done' }],
    });

    expect(result.success).toBe(true);
  });

  it('accepts response expectations on an api case and a scan expectation on an a11y case', () => {
    const api = TestCaseSchema.safeParse({
      ...base,
      testType: 'api',
      steps: [
        {
          description: 'GET /missing',
          expectations: [
            { kind: 'http-status', expected: 404 },
            { kind: 'http-body-contains', expected: 'not found' },
          ],
        },
      ],
    });
    const a11y = TestCaseSchema.safeParse({
      ...base,
      testType: 'a11y',
      steps: [{ description: 'Scan the page', expectations: [{ kind: 'a11y-clean' }] }],
      resultExpectations: [{ kind: 'visible', selector: 'main' }],
    });

    expect(api.success).toBe(true);
    expect(a11y.success).toBe(true);
  });

  it('keeps a case without any structured expectation valid', () => {
    const result = TestCaseSchema.safeParse({
      ...base,
      testType: 'e2e',
      steps: [{ description: 'Do something' }],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ['http-status', { kind: 'http-status', expected: 200 }, 'e2e'],
    ['http-body-contains', { kind: 'http-body-contains', expected: 'x' }, 'a11y'],
    ['a browser kind', { kind: 'visible', selector: '#a' }, 'api'],
    ['a11y-clean', { kind: 'a11y-clean' }, 'e2e'],
  ])('rejects %s on a case of the wrong type, naming where', (_label, expectation, testType) => {
    const step = TestCaseSchema.safeParse({
      ...base,
      testType,
      steps: [{ description: 'A step', expectations: [expectation] }],
    });
    const result = TestCaseSchema.safeParse({
      ...base,
      testType,
      steps: [{ description: 'A step' }],
      resultExpectations: [expectation],
    });

    expect(step.success).toBe(false);
    expect(step.error?.issues[0]?.path).toEqual(['steps', 0, 'expectations', 0]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['resultExpectations', 0]);
  });

  it.each([
    { kind: 'text', selector: '#a' },
    { kind: 'visible' },
    { kind: 'count', selector: '#a', expected: -1 },
    { kind: 'http-status', expected: 99 },
    { kind: 'unknown' },
  ])('rejects the malformed expectation %j', (expectation) => {
    const result = TestCaseSchema.safeParse({
      ...base,
      testType: 'e2e',
      steps: [{ description: 'A step', expectations: [expectation] }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty expectation list', () => {
    const result = TestCaseSchema.safeParse({
      ...base,
      testType: 'e2e',
      steps: [{ description: 'A step', expectations: [] }],
    });

    expect(result.success).toBe(false);
  });
});
