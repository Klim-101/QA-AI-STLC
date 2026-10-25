// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunResultSchema,
  TestCaseSchema,
  type Identifier,
  type RelativePath,
  type RunResultFailure,
  type RunResultStatus,
  type TestType,
} from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { EvidenceStore } from '../evidence-store.js';
import { ManifestStore } from '../manifest-store.js';
import { toCanonicalJson } from '../json-file.js';
import { randomIdGenerator, type IdGenerator } from '../ports/id-generator.js';
import { QaStore } from '../qa-store.js';
import { listRunResultPaths } from '../run-results.js';
import { canonicalStepIds } from '../step-ids.js';
import { findUnresolvedFailedExpectations } from './case-result-expectations.js';
import { assertPassedIsProven } from './case-result-passed.js';
import { findCasePath } from './cases-render.js';

export interface RegisterCaseResultOptions {
  readonly testCaseId: Identifier;
  readonly testType: TestType;
  readonly runId: Identifier;
  readonly status: RunResultStatus;
  readonly startedAt: string;
  readonly evidenceIds: readonly Identifier[];
  readonly failure?: RunResultFailure;
  /**
   * The case's step ids (`step-<N>`, `expected-result`) the execution did not reach. Required, and
   * only allowed, when `status` is `partial`.
   */
  readonly missingStepIds?: readonly string[];
  readonly idGenerator?: IdGenerator;
}

export interface RegisterCaseResultResult {
  readonly runResultPath: RelativePath;
  readonly id: string;
}

/**
 * Registers a `RunResultSchema` value for one interactive case-execution run (P3-14), tying
 * together every evidence id the execution produced. The engine never computes `status` itself —
 * the caller supplies it after reading the registered evidence, the same "the engine records, it
 * does not fabricate a verdict" principle ADR-005 already applies to browser actions.
 */
export async function runRegisterCaseResult(
  context: EngineContext,
  options: RegisterCaseResultOptions,
): Promise<RegisterCaseResultResult> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  // Resolving the case first rejects a caller-fabricated testCaseId before anything is written
  // (AGENTS.md 12.5 — evidence and the results built on it are the engine's own record, never a
  // caller's unverified claim); `findCasePath` is the same lookup `qa cases render` already uses.
  const casePath = await findCasePath(store, options.testCaseId);

  await assertRunNotBoundToAnotherCase(store, options);
  const missingStepIds = await resolveMissingStepIds(store, casePath, options);

  const manifest = new ManifestStore({ store, clock: context.clock });
  const evidenceStore = new EvidenceStore({ store, manifest, clock: context.clock });
  const registeredEvidenceIds = await evidenceStore.listRegisteredIds(options.runId);
  const unresolvedEvidenceIds = options.evidenceIds.filter((id) => !registeredEvidenceIds.has(id));
  if (unresolvedEvidenceIds.length > 0) {
    throw new QaError(
      'RUN_RESULT_UNRESOLVED_EVIDENCE',
      `Run result for test case "${options.testCaseId}" references evidence id(s) not registered ` +
        `under run "${options.runId}": ${unresolvedEvidenceIds.join(', ')}`,
      {
        remediation:
          'Only pass evidenceIds that a browser/registry tool call actually registered for this runId.',
      },
    );
  }
  if (options.status === 'passed' && options.evidenceIds.length === 0) {
    throw new QaError(
      'RUN_RESULT_MISSING_EVIDENCE',
      `Run result for test case "${options.testCaseId}" claims "passed" with no registered evidence.`,
      { remediation: 'Register at least one piece of evidence for this run before reporting it as passed.' },
    );
  }
  if (options.status === 'passed') {
    const unresolved = await findUnresolvedFailedExpectations(store, options.runId);
    if (unresolved.length > 0) {
      throw new QaError(
        'RUN_RESULT_FAILED_EXPECTATION',
        `Run result for test case "${options.testCaseId}" claims "passed" but run "${options.runId}" ` +
          `still has failed expectation(s): ${unresolved.join('; ')}`,
        {
          remediation:
            'Re-run the failed expectation until it passes, or register the result as "failed" or "partial".',
        },
      );
    }
  }

  if (options.status === 'passed') {
    await assertPassedIsProven(store, casePath, options);
  }

  const idGenerator = options.idGenerator ?? randomIdGenerator;
  const id = `run-result-${idGenerator.next()}`;
  const finishedAt = context.clock.now().toISOString();

  const runResult = RunResultSchema.parse({
    id,
    runId: options.runId,
    testCaseId: options.testCaseId,
    testType: options.testType,
    status: options.status,
    startedAt: options.startedAt,
    finishedAt,
    evidenceIds: options.evidenceIds,
    ...(options.failure !== undefined ? { failure: options.failure } : {}),
    ...(missingStepIds !== undefined ? { missingStepIds } : {}),
  });

  const runResultPath: RelativePath = `runs/${options.testCaseId}/${id}.json`;
  const serialized = toCanonicalJson(runResult);
  await store.writeJson(runResultPath, runResult);
  await manifest.register(runResultPath, serialized);

  return { runResultPath, id };
}

/**
 * Checks `missingStepIds` against the status and the registered case, so a `partial` result names
 * exactly the steps that were not done, and no other status carries the field.
 */
async function resolveMissingStepIds(
  store: QaStore,
  casePath: RelativePath,
  options: RegisterCaseResultOptions,
): Promise<readonly string[] | undefined> {
  const requested = options.missingStepIds;
  if (options.status !== 'partial') {
    if (requested !== undefined) {
      throw new QaError(
        'RUN_RESULT_MISSING_STEPS_NOT_PARTIAL',
        `"missingStepIds" is only allowed when status is "partial", not "${options.status}".`,
        { remediation: 'Leave missingStepIds out, or register the result as "partial".' },
      );
    }
    return undefined;
  }
  if (requested === undefined || requested.length === 0) {
    throw new QaError(
      'RUN_RESULT_MISSING_STEPS_REQUIRED',
      `Run result for test case "${options.testCaseId}" is "partial" but names no missing step.`,
      {
        remediation:
          "Pass missingStepIds with the step ids that were not done ('step-<N>', or 'expected-result').",
      },
    );
  }
  const testCase = await store.readJson(casePath, TestCaseSchema);
  const knownStepIds = canonicalStepIds(testCase);
  const unknown = requested.filter((stepId) => !knownStepIds.includes(stepId));
  if (unknown.length > 0) {
    throw new QaError(
      'RUN_RESULT_MISSING_STEP_UNKNOWN',
      `Test case "${options.testCaseId}" has no step id(s) ${unknown.join(', ')}.`,
      { remediation: `Use ids of this case: ${knownStepIds.join(', ')}.` },
    );
  }
  return [...new Set(requested)];
}

/**
 * A run belongs to the first case a result is registered for. Evidence carries no case id, so
 * without this a run that proved case A could be cited again as proof of case B.
 */
async function assertRunNotBoundToAnotherCase(
  store: QaStore,
  options: RegisterCaseResultOptions,
): Promise<void> {
  // `runs/` also holds `qa run` summaries and spoke records, which are not results.
  for (const path of await listRunResultPaths(store)) {
    const existing = await store.readJson(path, RunResultSchema);
    if (existing.runId === options.runId && existing.testCaseId !== options.testCaseId) {
      throw new QaError(
        'RUN_RESULT_RUN_BOUND_TO_OTHER_CASE',
        `Run "${options.runId}" already holds a result for test case "${existing.testCaseId}", not "${options.testCaseId}"`,
        {
          remediation:
            'Execute each case in a session of its own (qa.browser_open) and register it under that run.',
        },
      );
    }
  }
}
