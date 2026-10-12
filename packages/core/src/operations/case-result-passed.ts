// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { TestCaseSchema, type Identifier, type RelativePath } from '@qa-ai-stlc/schemas';
import { QaError } from '../errors.js';
import type { QaStore } from '../qa-store.js';
import { countCaseExpectations, evaluateCaseExpectations } from './case-expectation-verdicts.js';
import { readCitedObservations } from './case-result-observations.js';
import { findPassedProofGaps } from './case-result-proof.js';

export interface PassedClaim {
  readonly testCaseId: Identifier;
  readonly runId: Identifier;
  readonly evidenceIds: readonly Identifier[];
}

/**
 * Refuses a `passed` claim the cited evidence does not back (#603, ADR-0016). In order: every step
 * has successful evidence linked to it; every structured expectation the case declares is met,
 * judged by the engine from what it registered; and, for a case that declares none, the expected
 * result has a successful check of the case's type. A case that declares expectations is not asked
 * for the generic check as well, since its declared checks are the stricter statement of it.
 */
export async function assertPassedIsProven(
  store: QaStore,
  casePath: RelativePath,
  claim: PassedClaim,
): Promise<void> {
  const testCase = await store.readJson(casePath, TestCaseSchema);
  const observations = await readCitedObservations(store, claim.runId, claim.evidenceIds);

  const gaps = findPassedProofGaps(testCase, observations);
  if (gaps.stepsWithoutProof.length > 0) {
    throw new QaError(
      'RUN_RESULT_STEP_NOT_PROVEN',
      `Run result for test case "${claim.testCaseId}" claims "passed" but step(s) ${gaps.stepsWithoutProof.join(', ')} ` +
        'have no successful evidence linked to them in the cited evidence.',
      {
        remediation:
          "Perform each step with its stepId ('step-<N>', N the step's 1-based position) and cite that evidence, or register the result as 'failed' or 'partial'.",
      },
    );
  }

  const unmet = evaluateCaseExpectations(testCase, observations).filter(
    (outcome) => outcome.verdict !== 'met',
  );
  if (unmet.length > 0) {
    throw new QaError(
      'RUN_RESULT_EXPECTATION_UNMET',
      `Run result for test case "${claim.testCaseId}" claims "passed" but ${String(unmet.length)} declared expectation(s) are not met: ` +
        unmet.map((outcome) => `${outcome.where}: ${outcome.description} (${outcome.verdict})`).join('; '),
      {
        remediation:
          'Check each expectation with the engine exactly as the case declares it (the same kind, selector and expected value) and cite that evidence; "unmet" means the check ran and failed, "unobserved" that it never ran. Otherwise register the result as "failed" or "partial".',
      },
    );
  }

  if (countCaseExpectations(testCase) === 0 && !gaps.hasPassedCheck) {
    throw new QaError(
      'RUN_RESULT_EXPECTED_RESULT_UNCHECKED',
      `Run result for test case "${claim.testCaseId}" claims "passed" but no successful check of its ` +
        `${testCase.testType} expected result is among the cited evidence.`,
      {
        remediation:
          'Check the expected result with the engine (e2e: qa.browser_expect that passes; api: a request below 400; a11y: a scan with no violations) and cite that evidence, or register the result as "failed" or "partial".',
      },
    );
  }
}
