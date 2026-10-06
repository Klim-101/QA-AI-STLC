// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runTestRun, type Runner, type RunSummary } from '@qa-ai-stlc/core';
import { a11yRunner } from '@qa-ai-stlc/runner-a11y';
import { apiRunner } from '@qa-ai-stlc/runner-api';
import { playwrightRunner } from '@qa-ai-stlc/runner-playwright';
import type { TestType } from '@qa-ai-stlc/schemas';
import type { CommandContext } from '../command-context.js';

export type { RunSummary } from '@qa-ai-stlc/core';

export interface RunOptions {
  readonly specFiles: readonly string[];
  readonly testType?: TestType;
  readonly environment?: string;
}

// One runner per test type (`@qa-ai-stlc/runner-playwright`, P3-01; `@qa-ai-stlc/runner-api`, P6-04;
// `@qa-ai-stlc/runner-a11y`, P6-05). Total over `TestType`, so a new test type fails to compile here
// until it has a runner.
const RUNNERS_BY_TEST_TYPE: Record<TestType, Runner> = {
  e2e: playwrightRunner,
  api: apiRunner,
  a11y: a11yRunner,
};

/**
 * `qa run` / MCP `qa.run` (P3-04): resolves the `Runner` for `--test-type` (default `e2e`) and
 * delegates to `@qa-ai-stlc/core`'s `runTestRun`, which executes the spec set and persists the
 * results. Runner selection lives here, not in `core`, so `core` never depends on a concrete
 * runner package (mirrors `qa explore --pick`'s CLI-only browser orchestration in explore.ts).
 */
export async function runRun(context: CommandContext, options: RunOptions): Promise<RunSummary> {
  const testType = options.testType ?? 'e2e';
  const runner = RUNNERS_BY_TEST_TYPE[testType];
  return runTestRun(context, {
    runner,
    specFiles: options.specFiles,
    ...(options.environment !== undefined ? { environment: options.environment } : {}),
  });
}
