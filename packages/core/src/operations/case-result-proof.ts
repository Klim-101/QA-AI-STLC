// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { TestCase } from '@qa-ai-stlc/schemas';
import type { CitedObservation } from './case-result-observations.js';

const HTTP_ERROR_STATUS = 400;

/** What one cited record says about the step it is linked to. */
interface EvidenceReading {
  readonly stepId?: string;
  readonly isSuccessful: boolean;
  /** True when this record is, for the case's test type, a check that came out well. */
  readonly isPassedCheck: boolean;
}

/**
 * Why a case cannot be registered as `passed`, as engine-derived facts: the steps no successful
 * evidence is linked to, and whether any successful check exists at all (#603; the structured
 * expectations of ADR-0016 are judged separately, in `case-result-expectations.ts`).
 */
export interface PassedProofGaps {
  readonly stepsWithoutProof: readonly number[];
  readonly hasPassedCheck: boolean;
}

/**
 * Finds what the cited records fail to prove. A step is proven by a successful record linked to
 * `step-<N>`; the expected result is supported by at least one successful check of the case's own
 * test type:
 *
 * - `e2e`: a `qa.browser_expect` whose verdict is `passed`.
 * - `api`: a request that came back below 400, or, for a step that declares an `http-status`
 *   expectation, any request (the expectation decides whether that status is the right one).
 * - `a11y`: a scan with no violations and nothing left uncertain.
 *
 * A record that is not of the case's type is ignored rather than trusted.
 */
export function findPassedProofGaps(
  testCase: TestCase,
  observations: readonly CitedObservation[],
): PassedProofGaps {
  const statusDeclaredSteps = new Set(
    testCase.steps.flatMap((step, index) =>
      step.expectations?.some((expectation) => expectation.kind === 'http-status') === true
        ? [`step-${String(index + 1)}`]
        : [],
    ),
  );
  const readings = observations.flatMap((observation) => {
    const reading = readObservation(observation, testCase.testType, statusDeclaredSteps);
    return reading === undefined ? [] : [reading];
  });

  const provenStepIds = new Set(
    readings.flatMap((reading) =>
      reading.isSuccessful && reading.stepId !== undefined ? [reading.stepId] : [],
    ),
  );
  const stepsWithoutProof = testCase.steps.flatMap((_step, index) =>
    provenStepIds.has(`step-${String(index + 1)}`) ? [] : [index + 1],
  );
  return { stepsWithoutProof, hasPassedCheck: readings.some((reading) => reading.isPassedCheck) };
}

function readObservation(
  observation: CitedObservation,
  testType: TestCase['testType'],
  statusDeclaredSteps: ReadonlySet<string>,
): EvidenceReading | undefined {
  const stepId = observation.stepId === undefined ? {} : { stepId: observation.stepId };
  // An `a11y` case drives the page with the same browser actions an `e2e` case does; only an `e2e`
  // case is checked by `qa.browser_expect`.
  if (observation.source === 'action' && testType !== 'api') {
    const { type, expectation } = observation.action;
    const isFailedExpectation = type === 'expect' && expectation?.passed !== true;
    return {
      ...stepId,
      isSuccessful: !isFailedExpectation && type !== 'tab-blocked',
      isPassedCheck: testType === 'e2e' && type === 'expect' && expectation?.passed === true,
    };
  }
  if (observation.source === 'http' && testType === 'api') {
    const isOk = observation.record.status < HTTP_ERROR_STATUS;
    const isExpectedByStep = observation.stepId !== undefined && statusDeclaredSteps.has(observation.stepId);
    return { ...stepId, isSuccessful: isOk || isExpectedByStep, isPassedCheck: isOk };
  }
  if (observation.source === 'scan' && testType === 'a11y') {
    const isClean = observation.record.violations.length === 0 && observation.record.uncertain.length === 0;
    return { ...stepId, isSuccessful: isClean, isPassedCheck: isClean };
  }
  return undefined;
}
