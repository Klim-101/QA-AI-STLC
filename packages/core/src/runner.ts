// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { EvidenceKind, Identifier, RunResult, TestType } from '@qa-ai-stlc/schemas';
import type { EngineContext } from './engine-context.js';
import type { IdGenerator } from './ports/id-generator.js';

/**
 * The spec set one `Runner.run()` call executes. `specFiles` are absolute paths: a runner spawns
 * its own tool process, which has no notion of the project root a `RelativePath` is relative to.
 */
export interface RunnerInput {
  readonly runId: Identifier;
  readonly baseUrl: string;
  readonly specFiles: readonly string[];
  readonly idGenerator?: IdGenerator;
}

/**
 * Raw evidence a runner captured while producing one `RunResult` (a screenshot, a trace, redacted
 * network data), not yet registered. A runner never writes to the evidence store itself — that
 * stays the single enforcement point for evidence integrity (ADR-0004) — so it hands the caller
 * (`qa run`, P3-04) the raw content and its kind; the caller hashes, scans and writes it through
 * `EvidenceStore` and fills in the matching `RunResult.evidenceIds`.
 */
export interface RunnerEvidence {
  readonly kind: EvidenceKind;
  readonly content: string | Uint8Array;
  readonly stepId?: Identifier;
}

/** One test's `RunResult`, paired with whatever raw evidence the runner captured alongside it. */
export interface RunnerOutcome {
  readonly result: RunResult;
  readonly evidence: readonly RunnerEvidence[];
}

/**
 * The contract every test-type runner implements (`runner-playwright` today, `runner-api` and
 * `runner-a11y` later): execute a spec set through its own third-party tool and map that tool's
 * own report to validated `RunResult` values, plus whatever evidence it captured alongside them.
 * A runner never writes evidence or run records itself — the caller (`qa run`, P3-04) registers
 * what a runner returns.
 */
export interface Runner {
  readonly testType: TestType;
  run(engine: EngineContext, input: RunnerInput): Promise<readonly RunnerOutcome[]>;
}
