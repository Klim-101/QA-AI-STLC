// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { TestCase } from '@qa-ai-stlc/schemas';

/** Prefix for a `TestCaseStep`'s own generated/observed id (`step-1`, `step-2`, ...). */
export const STEP_ID_PREFIX = 'step-';

/** The case's `expectedResult` field has this one fixed id, distinct from any numbered step. */
export const EXPECTED_RESULT_STEP_ID = 'expected-result';

/**
 * The full set of step/expected-result ids a spec covering `testCase` must exercise (P3-02):
 * `step-1` .. `step-<N>` for each `TestCaseStep` in declaration order, plus `expected-result` for
 * the case's own `expectedResult`. This is the canonical set derived from the case the engine
 * itself registered — the authority a generated spec's own `stepIds` annotation is checked against
 * (P3-20), not a self-report the spec could under-declare.
 */
export function canonicalStepIds(testCase: Pick<TestCase, 'steps'>): readonly string[] {
  const stepIds = testCase.steps.map((_step, index) => `${STEP_ID_PREFIX}${String(index + 1)}`);
  return [...stepIds, EXPECTED_RESULT_STEP_ID];
}
