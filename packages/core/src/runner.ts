// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Identifier, RunResult, TestType } from '@qa-ai-stlc/schemas';
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
 * The contract every test-type runner implements (`runner-playwright` today, `runner-api` and
 * `runner-a11y` later): execute a spec set through its own third-party tool and map that tool's
 * own report to validated `RunResult` values. A runner never writes evidence or run records
 * itself — the caller (`qa run`, P3-04) registers what a runner returns.
 */
export interface Runner {
  readonly testType: TestType;
  run(engine: EngineContext, input: RunnerInput): Promise<readonly RunResult[]>;
}
