// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunResultSchema,
  type Identifier,
  type RelativePath,
  type RunResultFailure,
  type RunResultStatus,
  type TestType,
} from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { ManifestStore } from '../manifest-store.js';
import { toCanonicalJson } from '../json-file.js';
import { randomIdGenerator, type IdGenerator } from '../ports/id-generator.js';
import { QaStore } from '../qa-store.js';

export interface RegisterCaseResultOptions {
  readonly testCaseId: Identifier;
  readonly testType: TestType;
  readonly runId: Identifier;
  readonly status: RunResultStatus;
  readonly startedAt: string;
  readonly evidenceIds: readonly Identifier[];
  readonly failure?: RunResultFailure;
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
  });

  const runResultPath: RelativePath = `runs/${options.testCaseId}/${id}.json`;
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const serialized = toCanonicalJson(runResult);
  await store.writeJson(runResultPath, runResult);
  await manifest.register(runResultPath, serialized);

  return { runResultPath, id };
}
