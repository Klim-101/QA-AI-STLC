// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, runTestRun, type Runner } from '@qa-ai-stlc/core';
import { playwrightRunner } from '@qa-ai-stlc/runner-playwright';
import { RunResultStatusSchema, TestTypeSchema, type TestType } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

// Only `e2e` has a runner today (`@qa-ai-stlc/runner-playwright`, P3-01); `api`/`a11y` runners are
// later Phase 6 tasks (P6-04, P6-05). Keyed by `TestType` so a future runner is one entry, not a
// new dispatch shape — the same table `packages/cli/src/commands/run.ts` keeps for the CLI.
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

const InputSchema = z.object({
  specFiles: z.array(z.string()).min(1).describe('Project-relative paths to the spec files to run.'),
  testType: TestTypeSchema.optional().describe('The spec set\'s test type. Defaults to "e2e".'),
  environment: z
    .string()
    .optional()
    .describe('Environment name from config.yaml. Required when there is more than one.'),
});

const OutputSchema = z.object({
  runId: z.string(),
  runRecordPath: z.string(),
  resultPaths: z.array(z.string()),
  counts: z.record(RunResultStatusSchema, z.number().int().nonnegative()),
});

/**
 * `qa.run` (P3-04): the same `runTestRun` core call `qa run` uses — resolves the `Runner` for
 * `testType` (default `e2e`), runs the given spec set through it, and persists every `RunResult`
 * plus a `RunRecordSchema` summary under `.qa/runs/<run-id>/`. Returns only paths and per-status
 * counts, not the results themselves — read a specific result file for its `failure` message.
 */
export const runTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.run',
  description:
    'Runs a spec set through the runner for its test type (only "e2e" has one today) and persists ' +
    'every result plus a run summary under .qa/runs/<run-id>/. Returns paths and per-status counts ' +
    '— read a result file directly for its failure message.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const runner = resolveRunner(input.testType ?? 'e2e');
    const summary = await runTestRun(createNodeEngineContext(), {
      runner,
      specFiles: input.specFiles,
      ...(input.environment !== undefined ? { environment: input.environment } : {}),
    });
    return {
      runId: summary.runId,
      runRecordPath: summary.runRecordPath,
      resultPaths: [...summary.resultPaths],
      counts: summary.counts,
    };
  },
};
