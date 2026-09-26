// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { basename } from 'node:path';
import {
  ProvenActionSchema,
  ProvenSessionSchema,
  RunResultSchema,
  TestCaseSchema,
  type Identifier,
  type ProvenAction,
  type ProvenSession,
  type RunResult,
  type TestCase,
} from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { QaStore } from '../qa-store.js';
import { findCasePath } from './cases-render.js';

const STEP_ID_PREFIX = 'step-';

// Avoids a capturing regex on purpose: `noUncheckedIndexedAccess` types every capture group
// `string | undefined` regardless of the pattern, forcing an unreachable fallback for a group the
// pattern already guarantees (the same reasoning `verification.ts`'s `tsc` diagnostic parser
// documents). Plain string operations keep every branch here real and testable.
function parseStepIndex(stepId: Identifier): number {
  if (!stepId.startsWith(STEP_ID_PREFIX)) {
    throw new QaError(
      'core.proven_session.invalid_step_id',
      `Evidence step id "${stepId}" does not follow the "step-<N>" convention.`,
    );
  }
  const numeric = stepId.slice(STEP_ID_PREFIX.length);
  const index = Number.parseInt(numeric, 10);
  if (Number.isNaN(index) || index < 1 || String(index) !== numeric) {
    throw new QaError(
      'core.proven_session.invalid_step_id',
      `Evidence step id "${stepId}" does not follow the "step-<N>" convention.`,
    );
  }
  return index;
}

async function findLatestPassingRunResult(
  store: QaStore,
  testCaseId: Identifier,
): Promise<RunResult | undefined> {
  const paths = await store.listFiles(`runs/${testCaseId}`);
  const jsonPaths = paths.filter((path) => path.endsWith('.json'));
  const results = await Promise.all(jsonPaths.map((path) => store.readJson(path, RunResultSchema)));
  const passing = results.filter((result) => result.status === 'passed');
  if (passing.length === 0) {
    return undefined;
  }
  return passing.reduce((latest, candidate) =>
    new Date(candidate.finishedAt) > new Date(latest.finishedAt) ? candidate : latest,
  );
}

async function findEvidenceFilePath(
  store: QaStore,
  runId: Identifier,
  evidenceId: Identifier,
): Promise<string | undefined> {
  const files = await store.listFiles(`evidence/${runId}`);
  const prefix = `${evidenceId}.`;
  return files.find((path) => path.endsWith('.json') && basename(path).startsWith(prefix));
}

async function readProvenAction(store: QaStore, filePath: string): Promise<ProvenAction | undefined> {
  const raw = await store.readText(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const result = ProvenActionSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}

export interface FindLatestProvenSessionOptions {
  readonly testCaseId: Identifier;
}

/**
 * Recovers a case's most recently proven `qa-execute` session (P3-15) by reading its latest
 * `passed` `RunResult` and grouping the evidence that result's `evidenceIds` point to by the
 * `stepId` each action's own content carries. Not a session-log artifact: nothing beyond the
 * `RunResult` and evidence the engine already writes is read (decisions log, P3-07, 2026-09-25).
 * Returns `undefined` when the case has no passing session, or when one exists but no evidence
 * from it carries a `stepId` (an execution that predates this convention).
 */
export async function findLatestProvenSession(
  context: EngineContext,
  testCase: TestCase,
  options: FindLatestProvenSessionOptions,
): Promise<ProvenSession | undefined> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const latest = await findLatestPassingRunResult(store, options.testCaseId);
  if (latest === undefined) {
    return undefined;
  }

  const actionsByStepId = new Map<Identifier, ProvenAction[]>();
  for (const evidenceId of latest.evidenceIds) {
    const filePath = await findEvidenceFilePath(store, latest.runId, evidenceId);
    if (filePath === undefined) {
      continue;
    }
    const action = await readProvenAction(store, filePath);
    if (action?.stepId === undefined) {
      continue;
    }
    const existing = actionsByStepId.get(action.stepId) ?? [];
    actionsByStepId.set(action.stepId, [...existing, action]);
  }

  if (actionsByStepId.size === 0) {
    return undefined;
  }

  const steps = Array.from(actionsByStepId.entries())
    .sort(([a], [b]) => parseStepIndex(a) - parseStepIndex(b))
    .map(([stepId, actions]) => {
      const index = parseStepIndex(stepId);
      const step = testCase.steps[index - 1];
      if (step === undefined) {
        throw new QaError(
          'core.proven_session.step_out_of_range',
          `Evidence references "${stepId}", but test case "${testCase.id}" has only ` +
            `${String(testCase.steps.length)} step(s). Re-run qa-execute after the case changed.`,
        );
      }
      return { stepId, description: step.description, actions };
    });

  return ProvenSessionSchema.parse({
    testCaseId: options.testCaseId,
    runResultId: latest.id,
    steps,
  });
}

export interface RunFindProvenSessionOptions {
  readonly testCaseId: Identifier;
}

export type FindProvenSessionResult =
  { readonly found: false } | { readonly found: true; readonly session: ProvenSession };

/**
 * MCP `qa.generation_proven_session` (P3-07): resolves `testCaseId` to its registered case (the
 * same lookup `qa.cases_render` uses) and reads back its most recently proven `qa-execute`
 * session, if any — the input `qa-generate-tests` codifies into a spec.
 */
export async function runFindProvenSession(
  context: EngineContext,
  options: RunFindProvenSessionOptions,
): Promise<FindProvenSessionResult> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const casePath = await findCasePath(store, options.testCaseId);
  const testCase = await store.readJson(casePath, TestCaseSchema);
  const session = await findLatestProvenSession(context, testCase, options);
  return session === undefined ? { found: false } : { found: true, session };
}
