// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { basename } from 'node:path';
import {
  A11yScanRecordSchema,
  BrowserActionSchema,
  HttpRequestRecordSchema,
  type Identifier,
  type TestCase,
} from '@qa-ai-stlc/schemas';
import type { QaStore } from '../qa-store.js';

const HTTP_ERROR_STATUS = 400;

/** What one cited, engine-registered evidence record says about the step it is linked to. */
interface EvidenceReading {
  readonly stepId?: Identifier;
  readonly isSuccessful: boolean;
  /** True when this record is, for the case's test type, a check that came out well. */
  readonly isPassedCheck: boolean;
}

/**
 * Why a case cannot be registered as `passed`, as engine-derived facts: the steps no successful
 * evidence is linked to, and whether any successful check exists at all. Empty `stepsWithoutProof`
 * and `hasPassedCheck` mean the case's evidence is complete (variant A of #603: the engine verifies
 * that the checks exist and succeeded, it does not interpret the free-text expected result).
 */
export interface PassedProofGaps {
  readonly stepsWithoutProof: readonly number[];
  readonly hasPassedCheck: boolean;
}

/**
 * Reads the evidence a `passed` result cites and finds what it fails to prove. A step is proven by
 * a successful record linked to `step-<N>`; the expected result is supported by at least one
 * successful check of the case's own test type:
 *
 * - `e2e`: a `qa.browser_expect` whose verdict is `passed`.
 * - `api`: a request that came back below 400. There is no response expectation yet (#651), so a
 *   case that expects an error status cannot be registered as `passed`.
 * - `a11y`: a scan with no violations and nothing left uncertain.
 *
 * Only the cited ids count, and they were already verified to be registered under this run, so
 * evidence of another run never satisfies a step. A record the engine did not write in a shape it
 * knows is ignored rather than trusted.
 */
export async function findPassedProofGaps(
  store: QaStore,
  testCase: TestCase,
  runId: Identifier,
  evidenceIds: readonly Identifier[],
): Promise<PassedProofGaps> {
  const files = await store.listFiles(`evidence/${runId}`);
  const readings: EvidenceReading[] = [];
  for (const evidenceId of evidenceIds) {
    const path = files.find((file) => file.endsWith('.json') && basename(file).startsWith(`${evidenceId}.`));
    const reading = path === undefined ? undefined : await readEvidence(store, path, testCase.testType);
    if (reading !== undefined) {
      readings.push(reading);
    }
  }

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

async function readEvidence(
  store: QaStore,
  path: string,
  testType: TestCase['testType'],
): Promise<EvidenceReading | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await store.readText(path));
  } catch {
    // Evidence of another kind (a HAR, a log) is not a record this check reads.
    return undefined;
  }

  const action = BrowserActionSchema.safeParse(parsed);
  // An `a11y` case drives the page with the same browser actions an `e2e` case does; only an `e2e`
  // case is checked by `qa.browser_expect`.
  if (action.success && testType !== 'api') {
    const { type, expectation, stepId } = action.data;
    const isFailedExpectation = type === 'expect' && expectation?.passed !== true;
    return {
      ...(stepId === undefined ? {} : { stepId }),
      isSuccessful: !isFailedExpectation && type !== 'tab-blocked',
      isPassedCheck: testType === 'e2e' && type === 'expect' && expectation?.passed === true,
    };
  }
  const request = HttpRequestRecordSchema.safeParse(parsed);
  if (request.success && testType === 'api') {
    const isSuccessful = request.data.status < HTTP_ERROR_STATUS;
    return {
      ...(request.data.stepId === undefined ? {} : { stepId: request.data.stepId }),
      isSuccessful,
      isPassedCheck: isSuccessful,
    };
  }
  const scan = A11yScanRecordSchema.safeParse(parsed);
  if (scan.success && testType === 'a11y') {
    const isClean = scan.data.violations.length === 0 && scan.data.uncertain.length === 0;
    return {
      ...(scan.data.stepId === undefined ? {} : { stepId: scan.data.stepId }),
      isSuccessful: isClean,
      isPassedCheck: isClean,
    };
  }
  return undefined;
}
