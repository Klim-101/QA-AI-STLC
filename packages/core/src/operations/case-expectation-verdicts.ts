// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { CaseExpectation, TestCase } from '@qa-ai-stlc/schemas';
import { describeCaseExpectation } from '../case-expectation-text.js';
import type { CitedObservation } from './case-result-observations.js';

export type ExpectationVerdict = 'met' | 'unmet' | 'unobserved';

/** One structured expectation of a case and what the cited evidence says about it. */
export interface ExpectationOutcome {
  /** `step 2` or `result`. */
  readonly where: string;
  readonly description: string;
  readonly verdict: ExpectationVerdict;
}

/**
 * Derives, for every structured expectation a case declares (ADR-0016), whether the cited evidence
 * meets it. The caller supplies no comparison: the engine reads the records it registered itself.
 *
 * A step's expectations look only at records linked to that step; `resultExpectations` look at all
 * of them. When a check was made more than once the newest record counts, so a failed attempt that
 * a later one corrected is not held against the case. A record about a different target or a
 * different expected value is a different check and does not count, so `unobserved` means nothing
 * the case declared was ever checked.
 */
export function evaluateCaseExpectations(
  testCase: TestCase,
  observations: readonly CitedObservation[],
): readonly ExpectationOutcome[] {
  const outcomes: ExpectationOutcome[] = [];
  testCase.steps.forEach((step, index) => {
    const stepId = `step-${String(index + 1)}`;
    for (const expectation of step.expectations ?? []) {
      outcomes.push({
        where: `step ${String(index + 1)}`,
        description: describeCaseExpectation(expectation),
        verdict: judge(expectation, observations, stepId),
      });
    }
  });
  for (const expectation of testCase.resultExpectations ?? []) {
    outcomes.push({
      where: 'result',
      description: describeCaseExpectation(expectation),
      verdict: judge(expectation, observations, undefined),
    });
  }
  return outcomes;
}

/** How many structured expectations a case declares, steps and result together. */
export function countCaseExpectations(testCase: TestCase): number {
  return (
    testCase.steps.reduce((total, step) => total + (step.expectations?.length ?? 0), 0) +
    (testCase.resultExpectations?.length ?? 0)
  );
}

function judge(
  expectation: CaseExpectation,
  observations: readonly CitedObservation[],
  stepId: string | undefined,
): ExpectationVerdict {
  const verdicts = observations.flatMap((observation, order) => {
    if (stepId !== undefined && observation.stepId !== stepId) {
      return [];
    }
    const verdict = judgeObservation(expectation, observation);
    return verdict === undefined ? [] : [{ ...verdict, order }];
  });
  // Newest first; where records share a time (or have none, as a scan does) the later citation wins.
  const newest = [...verdicts].sort((a, b) => b.at.localeCompare(a.at) || b.order - a.order)[0];
  if (newest === undefined) {
    return 'unobserved';
  }
  return newest.isMet ? 'met' : 'unmet';
}

interface ObservationVerdict {
  readonly at: string;
  readonly isMet: boolean;
}

function judgeObservation(
  expectation: CaseExpectation,
  observation: CitedObservation,
): ObservationVerdict | undefined {
  switch (expectation.kind) {
    case 'http-status':
      return observation.source === 'http'
        ? { at: observation.record.at, isMet: observation.record.status === expectation.expected }
        : undefined;
    case 'http-body-contains':
      return observation.source === 'http'
        ? { at: observation.record.at, isMet: observation.record.bodyPreview.includes(expectation.expected) }
        : undefined;
    case 'a11y-clean':
      return observation.source === 'scan'
        ? {
            at: '',
            isMet: observation.record.violations.length === 0 && observation.record.uncertain.length === 0,
          }
        : undefined;
    default:
      return judgeBrowserExpectation(expectation, observation);
  }
}

function judgeBrowserExpectation(
  expectation: Exclude<CaseExpectation, { kind: 'http-status' | 'http-body-contains' | 'a11y-clean' }>,
  observation: CitedObservation,
): ObservationVerdict | undefined {
  if (observation.source !== 'action' || observation.action.type !== 'expect') {
    return undefined;
  }
  const recorded = observation.action.expectation;
  if (recorded?.kind !== expectation.kind) {
    return undefined;
  }
  if ('selector' in expectation && observation.action.selector !== expectation.selector) {
    return undefined;
  }
  if (!isSameExpectedValue(expectation, recorded.expected)) {
    return undefined;
  }
  return { at: observation.action.at, isMet: recorded.passed };
}

function isSameExpectedValue(
  expectation: Exclude<CaseExpectation, { kind: 'http-status' | 'http-body-contains' | 'a11y-clean' }>,
  recorded: string | number | boolean | undefined,
): boolean {
  switch (expectation.kind) {
    case 'visible':
    case 'hidden':
      return true;
    case 'checked':
      return (expectation.expected ?? true) === (recorded ?? true);
    case 'text':
    case 'value':
    case 'count':
    case 'url':
      return expectation.expected === recorded;
  }
}
