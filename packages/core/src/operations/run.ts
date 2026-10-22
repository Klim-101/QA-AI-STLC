// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunRecordSchema,
  RunResultSchema,
  RunResultStatusSchema,
  type Identifier,
  type RelativePath,
  type RunResult,
  type RunResultStatus,
} from '@qa-ai-stlc/schemas';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { EvidenceStore } from '../evidence-store.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { randomIdGenerator, type IdGenerator } from '../ports/id-generator.js';
import { QaStore } from '../qa-store.js';
import { resolveRunIdentity, resolveRunnerInputIdentity } from '../run-identity.js';
import { resolveBrowserEnvironment } from './browser-open.js';
import type { Runner, RunnerOutcome } from '../runner.js';

export interface RunOptions {
  /** The `Runner` implementation for `specFiles`' test type (e.g. `playwrightRunner` for `e2e`). */
  readonly runner: Runner;
  /** Project-relative paths to the spec files to run. */
  readonly specFiles: readonly string[];
  /** Environment name from config.yaml. Required only when the project defines more than one. */
  readonly environment?: string;
  /** Identity name from config.yaml to sign in as; defaults to the environment's own `identity`. */
  readonly identity?: string;
  readonly idGenerator?: IdGenerator;
}

export interface RunSummary {
  readonly runId: Identifier;
  readonly runRecordPath: RelativePath;
  /** The identity the run signed in as; absent for an anonymous run. */
  readonly identity?: string;
  readonly resultPaths: readonly RelativePath[];
  readonly counts: Readonly<Record<RunResultStatus, number>>;
}

export function zeroedCounts(): Record<RunResultStatus, number> {
  const counts = {} as Record<RunResultStatus, number>;
  for (const status of RunResultStatusSchema.options) {
    counts[status] = 0;
  }
  return counts;
}

/**
 * Registers whatever raw evidence a runner captured for one result through `EvidenceStore`
 * (hashed, scanned and, for `network-har`, redacted — AGENTS.md 12.5) and returns the result with
 * `evidenceIds` filled in. Content the secret scanner quarantined is left out of `evidenceIds`
 * rather than failing the whole run: a run result IS the engine's own honest record of what
 * happened, unlike a live browser tool call, which has nothing else to report if its one piece of
 * evidence was quarantined (`registerEvidenceOrThrow`).
 */
async function registerResultEvidence(
  evidenceStore: EvidenceStore,
  idGenerator: IdGenerator,
  outcome: RunnerOutcome,
): Promise<RunResult> {
  const evidenceIds: Identifier[] = [];
  for (const item of outcome.evidence) {
    const registration = await evidenceStore.register({
      id: `evidence-${idGenerator.next()}`,
      runId: outcome.result.runId,
      kind: item.kind,
      content: item.content,
      ...(item.stepId !== undefined ? { stepId: item.stepId } : {}),
    });
    if (registration.status === 'registered') {
      evidenceIds.push(registration.evidence.id);
    }
  }

  const result = RunResultSchema.parse({ ...outcome.result, evidenceIds });

  // The literal exit criterion for evidence capture (P3-03): a failed result the engine cannot
  // back up with at least one registered screenshot/trace/log is not a trustworthy failure record.
  if (result.status === 'failed' && result.evidenceIds.length === 0) {
    throw new QaError(
      'RUN_RESULT_MISSING_EVIDENCE',
      `Run result "${result.id}" for test case "${result.testCaseId}" failed with no registered evidence.`,
      {
        remediation:
          'The runner for this test type must capture at least one evidence item (e.g. a screenshot or trace) for a failing test.',
      },
    );
  }

  return result;
}

export interface RunnerExecution {
  readonly runId: Identifier;
  readonly startedAt: string;
  readonly specFiles: readonly RelativePath[];
  readonly baseUrl: string;
  /** The identity the run signed in as; absent for an anonymous run. */
  readonly identity?: string;
  readonly idGenerator: IdGenerator;
  readonly outcomes: readonly RunnerOutcome[];
}

/**
 * Resolves the environment and identity, runs the spec set through the runner and refuses a run
 * that produced no result at all. Persists nothing: `runTestRun` records what comes back, and
 * `runSpecCheck` does not.
 */
export async function executeRunner(context: EngineContext, options: RunOptions): Promise<RunnerExecution> {
  const specFiles = options.specFiles.map(assertRelativePath);
  const absoluteSpecFiles = specFiles.map((specFile) => resolveRelativePath(context.projectRoot, specFile));

  const config = await loadConfig(context);
  const environment = resolveBrowserEnvironment(config, options.environment);

  const identity = resolveRunIdentity(config, environment.config, options.runner, options.identity);
  const runnerIdentity = resolveRunnerInputIdentity(
    config,
    environment.config,
    options.runner,
    options.identity,
  );
  const idGenerator = options.idGenerator ?? randomIdGenerator;
  const runId = `run-${idGenerator.next()}`;
  const startedAt = context.clock.now().toISOString();

  const outcomes = await options.runner.run(context, {
    runId,
    baseUrl: environment.config.baseUrl,
    environment: environment.name,
    specFiles: absoluteSpecFiles,
    idGenerator,
    testIdAttribute: config.selectors.testIdAttribute,
    ...(environment.config.locale !== undefined ? { locale: environment.config.locale } : {}),
    ...(runnerIdentity !== undefined ? { identity: runnerIdentity } : {}),
  });

  // A spec path that does not exist or matches nothing still makes Playwright write a JSON report
  // with zero test entries — no crash, so `RUNNER_NO_REPORT` never fires — and zero outcomes would
  // otherwise persist a clean-looking `RunRecord` with every count at zero, a silent false green
  // (nothing was actually verified) rather than a real one. Distinct from a run that produced
  // results with a `skipped`/`passed` status: this rejects producing *no* results at all.
  if (specFiles.length > 0 && outcomes.length === 0) {
    throw new QaError('RUN_NO_RESULTS', `The spec set produced zero results: ${specFiles.join(', ')}.`, {
      remediation: 'Check that every --spec path exists and matches at least one test.',
    });
  }
  return {
    runId,
    startedAt,
    specFiles,
    baseUrl: environment.config.baseUrl,
    ...(identity !== undefined ? { identity } : {}),
    idGenerator,
    outcomes,
  };
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
  const execution = await executeRunner(context, options);
  const { runId, startedAt, specFiles, idGenerator, identity, outcomes } = execution;
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const evidenceStore = new EvidenceStore({ store, manifest, clock: context.clock });
  const resultPaths: RelativePath[] = [];
  const results: RunResult[] = [];
  const counts = zeroedCounts();
  for (const outcome of outcomes) {
    const result = await registerResultEvidence(evidenceStore, idGenerator, outcome);
    const resultPath: RelativePath = `runs/${runId}/results/${result.id}.json`;
    const serialized = toCanonicalJson(result);
    await store.writeText(resultPath, serialized);
    await manifest.register(resultPath, serialized);
    resultPaths.push(resultPath);
    results.push(result);
    counts[result.status] += 1;
  }

  const finishedAt = context.clock.now().toISOString();
  const runRecord = RunRecordSchema.parse({
    id: runId,
    testType: options.runner.testType,
    specFiles,
    baseUrl: execution.baseUrl,
    ...(identity !== undefined ? { identity } : {}),
    startedAt,
    finishedAt,
    resultIds: results.map((result) => result.id),
    counts,
  });
  const runRecordPath: RelativePath = `runs/${runId}/run.json`;
  const serializedRecord = toCanonicalJson(runRecord);
  await store.writeText(runRecordPath, serializedRecord);
  await manifest.register(runRecordPath, serializedRecord);

  return { runId, runRecordPath, resultPaths, counts, ...(identity !== undefined ? { identity } : {}) };
}
