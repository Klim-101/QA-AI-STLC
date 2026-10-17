// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RegressionTier, TestCase } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { planRegression, type CaseSpecState } from './regression-plan.js';

function testCase(
  id: string,
  overrides: Partial<Pick<TestCase, 'status' | 'testType' | 'title'>> & { tier?: RegressionTier | null } = {},
): TestCase {
  const { tier, ...rest } = overrides;
  return {
    schemaVersion: 1,
    id,
    feature: 'f',
    requirementIds: ['r'],
    testType: 'e2e',
    title: `Case ${id}`,
    steps: [{ description: 'Do it' }],
    expectedResult: 'It works',
    status: 'approved',
    createdAt: '2026-10-01T09:00:00Z',
    ...(tier === null ? {} : { regressionTier: tier ?? 'smoke' }),
    ...rest,
  };
}

function plan(
  cases: readonly TestCase[],
  maxTier: RegressionTier,
  options: { flaky?: readonly string[]; specs?: Readonly<Record<string, CaseSpecState>> } = {},
) {
  return planRegression({
    cases,
    maxTier,
    flakyCaseIds: new Set(options.flaky ?? []),
    specStates: new Map(Object.entries(options.specs ?? {})),
  });
}

describe('planRegression: selection', () => {
  const CASES = [
    testCase('a-smoke', { tier: 'smoke' }),
    testCase('b-critical', { tier: 'critical-path' }),
    testCase('c-regression', { tier: 'regression' }),
    testCase('d-extended', { tier: 'extended' }),
  ];

  it.each([
    ['smoke', ['a-smoke']],
    ['critical-path', ['a-smoke', 'b-critical']],
    ['regression', ['a-smoke', 'b-critical', 'c-regression']],
    ['extended', ['a-smoke', 'b-critical', 'c-regression', 'd-extended']],
  ] as const)('takes every tier up to %s', (maxTier, expected) => {
    const result = plan(CASES, maxTier);

    expect(result.included.map((entry) => entry.testCaseId)).toEqual(expected);
    expect(result.excluded.map((entry) => entry.reason)).toEqual(
      CASES.slice(expected.length).map(() => 'tier-above-threshold'),
    );
  });

  it('orders the pack by tier and then id, whatever order the cases came in', () => {
    const result = plan(
      [
        testCase('z', { tier: 'smoke' }),
        testCase('m', { tier: 'critical-path' }),
        testCase('a', { tier: 'critical-path' }),
        testCase('b', { tier: 'smoke' }),
      ],
      'extended',
    );

    expect(result.included.map((entry) => entry.testCaseId)).toEqual(['b', 'z', 'a', 'm']);
  });

  it('leaves out a case that is not approved, one with no tier and one that is flaky, each with its reason', () => {
    const result = plan(
      [
        testCase('draft', { status: 'draft', tier: 'smoke' }),
        testCase('draft-no-tier', { status: 'rejected', tier: null }),
        testCase('untiered', { tier: null }),
        testCase('flaky-one', { tier: 'smoke' }),
        testCase('fine', { tier: 'smoke' }),
      ],
      'extended',
      { flaky: ['flaky-one'] },
    );

    expect(result.included.map((entry) => entry.testCaseId)).toEqual(['fine']);
    expect(result.excluded).toEqual([
      { testCaseId: 'draft', title: 'Case draft', reason: 'not-approved', tier: 'smoke' },
      { testCaseId: 'draft-no-tier', title: 'Case draft-no-tier', reason: 'not-approved' },
      { testCaseId: 'flaky-one', title: 'Case flaky-one', reason: 'flaky', tier: 'smoke' },
      { testCaseId: 'untiered', title: 'Case untiered', reason: 'no-tier' },
    ]);
  });

  it('plans nothing for no cases', () => {
    expect(plan([], 'smoke')).toMatchObject({ included: [], excluded: [], specRuns: [] });
  });
});

describe('planRegression: routes', () => {
  it('runs a case with a verified spec as that spec, and every other case live with the reason', () => {
    const result = plan(
      [testCase('has-spec'), testCase('no-spec'), testCase('stale'), testCase('changed')],
      'smoke',
      {
        specs: {
          'has-spec': { kind: 'verified', specPath: 'tests/qa/generated/has-spec.spec.ts' },
          stale: { kind: 'stale' },
          changed: { kind: 'changed' },
        },
      },
    );

    expect(result.included.map((entry) => [entry.testCaseId, entry.route, entry.routeReason])).toEqual([
      ['changed', 'live', 'spec-changed'],
      ['has-spec', 'spec', 'verified-spec'],
      ['no-spec', 'live', 'no-verified-spec'],
      ['stale', 'live', 'stale-spec'],
    ]);
    expect(result.included.find((entry) => entry.testCaseId === 'has-spec')?.specPath).toBe(
      'tests/qa/generated/has-spec.spec.ts',
    );
    expect(result.included.find((entry) => entry.testCaseId === 'no-spec')).not.toHaveProperty('specPath');
  });

  it('groups the specs into one run per test type, each spec once and in order', () => {
    const result = plan(
      [testCase('e1'), testCase('e2'), testCase('e3'), testCase('a1', { testType: 'api' })],
      'smoke',
      {
        specs: {
          e1: { kind: 'verified', specPath: 'tests/b.spec.ts' },
          e2: { kind: 'verified', specPath: 'tests/a.spec.ts' },
          e3: { kind: 'verified', specPath: 'tests/b.spec.ts' },
          a1: { kind: 'verified', specPath: 'tests/api.spec.ts' },
        },
      },
    );

    expect(result.specRuns).toEqual([
      { testType: 'api', specFiles: ['tests/api.spec.ts'] },
      { testType: 'e2e', specFiles: ['tests/a.spec.ts', 'tests/b.spec.ts'] },
    ]);
  });
});
