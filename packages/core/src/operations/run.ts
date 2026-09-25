// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunRecordSchema,
  RunResultStatusSchema,
  type Identifier,
  type RelativePath,
  type RunResultStatus,
} from '@qa-ai-stlc/schemas';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { randomIdGenerator, type IdGenerator } from '../ports/id-generator.js';
import { QaStore } from '../qa-store.js';
import { resolveBrowserEnvironment } from './browser-open.js';
import type { Runner } from '../runner.js';

export interface RunOptions {
  /** The `Runner` implementation for `specFiles`' test type (e.g. `playwrightRunner` for `e2e`). */
  readonly runner: Runner;
  /** Project-relative paths to the spec files to run. */
  readonly specFiles: readonly string[];
  /** Environment name from config.yaml. Required only when the project defines more than one. */
  readonly environment?: string;
  readonly idGenerator?: IdGenerator;
}

export interface RunSummary {
  readonly runId: Identifier;
  readonly runRecordPath: RelativePath;
  readonly resultPaths: readonly RelativePath[];
  readonly counts: Readonly<Record<RunResultStatus, number>>;
}

function zeroedCounts(): Record<RunResultStatus, number> {
  const counts = {} as Record<RunResultStatus, number>;
  for (const status of RunResultStatusSchema.options) {
    counts[status] = 0;
  }
  return counts;
}

/**
 * `qa run` / MCP `qa.run` (P3-04): runs a spec set through the given `Runner` and persists every
 * `RunResult` it produces, plus a `RunRecordSchema` summary, under `.qa/runs/<run-id>/` — one
 * directory per invocation, distinct from `runRegisterCaseResult`'s per-case layout (P3-14), which
 * has no spec set or runner behind it. `core` never imports a concrete runner package (only the
 * `Runner` interface it already owns); the caller supplies one, the same injection pattern as
 * `EngineContext`'s own ports (AGENTS.md 5.3).
 */
export async function runTestRun(context: EngineContext, options: RunOptions): Promise<RunSummary> {
  const specFiles = options.specFiles.map(assertRelativePath);
  const absoluteSpecFiles = specFiles.map((specFile) => resolveRelativePath(context.projectRoot, specFile));

  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const config = await loadConfig(store);
  const environment = resolveBrowserEnvironment(config, options.environment);

  const idGenerator = options.idGenerator ?? randomIdGenerator;
  const runId = `run-${idGenerator.next()}`;
  const startedAt = context.clock.now().toISOString();

  const results = await options.runner.run(context, {
    runId,
    baseUrl: environment.config.baseUrl,
    specFiles: absoluteSpecFiles,
    idGenerator,
  });

  const manifest = new ManifestStore({ store, clock: context.clock });
  const resultPaths: RelativePath[] = [];
  const counts = zeroedCounts();
  for (const result of results) {
    const resultPath: RelativePath = `runs/${runId}/results/${result.id}.json`;
    const serialized = toCanonicalJson(result);
    await store.writeText(resultPath, serialized);
    await manifest.register(resultPath, serialized);
    resultPaths.push(resultPath);
    counts[result.status] += 1;
  }

  const finishedAt = context.clock.now().toISOString();
  const runRecord = RunRecordSchema.parse({
    id: runId,
    testType: options.runner.testType,
    specFiles,
    baseUrl: environment.config.baseUrl,
    startedAt,
    finishedAt,
    resultIds: results.map((result) => result.id),
    counts,
  });
  const runRecordPath: RelativePath = `runs/${runId}/run.json`;
  const serializedRecord = toCanonicalJson(runRecord);
  await store.writeText(runRecordPath, serializedRecord);
  await manifest.register(runRecordPath, serializedRecord);

  return { runId, runRecordPath, resultPaths, counts };
}
