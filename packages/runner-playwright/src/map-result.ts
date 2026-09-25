// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, randomIdGenerator, type IdGenerator } from '@qa-ai-stlc/core';
import { RunResultSchema, type Identifier, type RunResult, type RunResultStatus } from '@qa-ai-stlc/schemas';
import {
  collectSpecs,
  collectStepIds,
  type PlaywrightJsonReport,
  type PlaywrightTestResult,
} from './json-report.js';

function assertNever(value: never): never {
  throw new Error(`Unhandled Playwright test status: ${String(value)}`);
}

// `timedOut` and `interrupted` are Playwright-specific refinements of `failed`; the engine's own
// `RunResultStatusSchema` (AGENTS.md 12.5) has no matching statuses. A timeout is the test's own
// assertion never completing, so it reports as `failed`, same as any other unmet expectation. An
// interruption (the run was stopped from outside the test, e.g. a global timeout or Ctrl+C) is not
// the test's own failure to report at all, so it reports as `blocked`, matching that status's
// "the engine could not complete the check" meaning.
function mapStatus(status: PlaywrightTestResult['status']): RunResultStatus {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'failed':
    case 'timedOut':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case 'interrupted':
      return 'blocked';
    default:
      return assertNever(status);
  }
}

// Playwright colors terminal error messages with ANSI escape codes even when writing to a JSON
// file; a `RunResultFailure.message` is read by humans in rendered reports, not a terminal.
function stripAnsiCodes(text: string): string {
  // eslint-disable-next-line no-control-regex -- ANSI escape sequences are control characters by definition.
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

// A `stepIds` annotation is how a spec declares the full set of step/expected-result IDs its
// `test.step()` calls are supposed to cover (P3-02); its `description` is that set, comma
// separated, in declaration order. A test with no such annotation opts out of coverage tracking
// entirely — kept optional so a hand-written spec with no `test.step()` calls (e.g. P3-01's own
// fixture) is unaffected.
function parseDeclaredStepIds(description: string | undefined): readonly string[] {
  if (description === undefined || description.length === 0) {
    return [];
  }
  return description.split(',').map((id) => id.trim());
}

export interface MapReportOptions {
  readonly report: PlaywrightJsonReport;
  readonly runId: Identifier;
  readonly testType: 'e2e';
  readonly idGenerator?: IdGenerator;
}

/**
 * Maps every test Playwright actually ran to a validated `RunResult`. Throws a `QaError` for a
 * test with no `testCaseId` annotation: the engine has no case to attribute the result to, and
 * fabricating one would violate "the engine records, it does not fabricate a verdict" (ADR-005).
 */
export function mapReportToRunResults(options: MapReportOptions): readonly RunResult[] {
  const idGenerator = options.idGenerator ?? randomIdGenerator;
  const results: RunResult[] = [];

  for (const spec of collectSpecs(options.report)) {
    for (const test of spec.tests) {
      const annotation = test.annotations.find((candidate) => candidate.type === 'testCaseId');
      if (annotation?.description === undefined) {
        throw new QaError(
          'RUNNER_MISSING_TEST_CASE_ID',
          `Playwright test "${spec.title}" has no "testCaseId" annotation.`,
          {
            remediation:
              "Declare the test with `test(title, { annotation: { type: 'testCaseId', description: '<id>' } }, ...)` so its run result can be attributed to a registered test case.",
          },
        );
      }
      const lastResult = test.results.at(-1);
      if (lastResult === undefined) {
        throw new QaError('RUNNER_NO_TEST_RESULT', `Playwright test "${spec.title}" produced no result.`);
      }

      const mappedStatus = mapStatus(lastResult.status);
      const startedAt = new Date(lastResult.startTime);
      const finishedAt = new Date(startedAt.getTime() + lastResult.duration);
      const failureMessage = lastResult.errors[0]?.message;

      const stepIdsAnnotation = test.annotations.find((candidate) => candidate.type === 'stepIds');
      const declaredStepIds = parseDeclaredStepIds(stepIdsAnnotation?.description);
      const observedStepIds = new Set(collectStepIds(lastResult.steps));
      const missingStepIds = declaredStepIds.filter((id) => !observedStepIds.has(id));

      // Incomplete step coverage on a test Playwright itself considers finished (passed or
      // failed) means the case was not actually exercised in full — reporting it as `passed` or
      // `failed` would claim a verdict the run never reached (AGENTS.md 12.5); `partial` says so
      // honestly. A test Playwright already reports as `blocked` or `skipped` is already honest
      // about not having run to completion, so coverage does not override those.
      const status: RunResultStatus =
        missingStepIds.length > 0 && (mappedStatus === 'passed' || mappedStatus === 'failed')
          ? 'partial'
          : mappedStatus;

      results.push(
        RunResultSchema.parse({
          id: `run-result-${idGenerator.next()}`,
          runId: options.runId,
          testCaseId: annotation.description,
          testType: options.testType,
          status,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          evidenceIds: [],
          ...(status === 'failed' || status === 'partial'
            ? {
                failure: {
                  message: stripAnsiCodes(
                    failureMessage ??
                      (status === 'partial'
                        ? `Missing step coverage for: ${missingStepIds.join(', ')}.`
                        : 'Playwright reported a failure with no error message.'),
                  ),
                },
              }
            : {}),
          ...(status === 'partial' ? { missingStepIds } : {}),
        }),
      );
    }
  }

  return results;
}
