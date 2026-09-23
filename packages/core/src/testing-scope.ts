// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { TestCase, TestingScope, TestType } from '@qa-ai-stlc/schemas';

// Every testing type a case can declare (`TestTypeSchema`); `security` has no cases of its own
// (test-case.ts) and never appears here.
const CASE_TEST_TYPES: readonly TestType[] = ['e2e', 'api', 'a11y'];

/**
 * Every testing-scope type (development plan section 2.7) still left `undecided`, in
 * `TestingScope`'s own declared field order (e2e, api, a11y, security). Empty means the survey
 * is complete, whether every type ended up in scope or not.
 */
export function findUndecidedTestingTypes(testing: TestingScope): readonly string[] {
  return (Object.keys(testing) as (keyof TestingScope)[]).filter((type) => testing[type] === 'undecided');
}

export type CaseSetTypeStatus = 'satisfied' | 'missing' | 'not-applicable';

export interface CaseSetCompleteness {
  /** One status per case-bearing type: `not-applicable` for a type that is not `in-scope`, else `satisfied`/`missing`. */
  readonly statusByType: Readonly<Record<TestType, CaseSetTypeStatus>>;
  /** A type with at least one registered case even though it is not `in-scope` — never silently skipped. */
  readonly outOfScopeTypes: readonly TestType[];
}

/**
 * Whether `cases` has "one case set per in-scope type" (P2-16, development plan section 2.7): a
 * type recorded `in-scope` needs at least one registered case of that type; a type that is not
 * `in-scope` is `not-applicable`, and finding a case registered for it anyway (a hand-written
 * case, or a scope decision changed after the case was added) is reported separately rather than
 * silently accepted.
 */
export function checkCaseSetCompleteness(
  testing: TestingScope,
  cases: readonly TestCase[],
): CaseSetCompleteness {
  const typesWithCases = new Set(cases.map((testCase) => testCase.testType));
  const statusByType = {} as Record<TestType, CaseSetTypeStatus>;
  for (const type of CASE_TEST_TYPES) {
    if (testing[type] !== 'in-scope') {
      statusByType[type] = 'not-applicable';
    } else {
      statusByType[type] = typesWithCases.has(type) ? 'satisfied' : 'missing';
    }
  }
  const outOfScopeTypes = CASE_TEST_TYPES.filter(
    (type) => testing[type] !== 'in-scope' && typesWithCases.has(type),
  );
  return { statusByType, outOfScopeTypes };
}
