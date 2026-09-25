// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, runTestRun, type Runner, type RunSummary } from '@qa-ai-stlc/core';
import { playwrightRunner } from '@qa-ai-stlc/runner-playwright';
import type { TestType } from '@qa-ai-stlc/schemas';
import type { CommandContext } from '../command-context.js';

export type { RunSummary } from '@qa-ai-stlc/core';

export interface RunOptions {
  readonly specFiles: readonly string[];
  readonly testType?: TestType;
  readonly environment?: string;
}

// Only `e2e` has a runner today (`@qa-ai-stlc/runner-playwright`, P3-01); `api`/`a11y` runners are
// later Phase 6 tasks (P6-04, P6-05). Keyed by `TestType` so a future runner is one entry, not a
// new dispatch shape.
const RUNNERS_BY_TEST_TYPE: Partial<Record<TestType, Runner>> = {
  e2e: playwrightRunner,
};

function resolveRunner(testType: TestType): Runner {
  const runner = RUNNERS_BY_TEST_TYPE[testType];
  if (runner === undefined) {
    throw new QaError('RUN_TEST_TYPE_UNSUPPORTED', `No runner is available yet for test type "${testType}"`, {
      remediation: `Use one of: ${Object.keys(RUNNERS_BY_TEST_TYPE).join(', ')}.`,
    });
  }
  return runner;
}

/**
 * `qa run` / MCP `qa.run` (P3-04): resolves the `Runner` for `--test-type` (default `e2e`) and
 * delegates to `@qa-ai-stlc/core`'s `runTestRun`, which executes the spec set and persists the
 * results. Runner selection lives here, not in `core`, so `core` never depends on a concrete
 * runner package (mirrors `qa explore --pick`'s CLI-only browser orchestration in explore.ts).
 */
export async function runRun(context: CommandContext, options: RunOptions): Promise<RunSummary> {
  const testType = options.testType ?? 'e2e';
  const runner = resolveRunner(testType);
  return runTestRun(context, {
    runner,
    specFiles: options.specFiles,
    ...(options.environment !== undefined ? { environment: options.environment } : {}),
  });
}
