// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runRunMetrics } from '@qa-ai-stlc/core';
import { RunMetricsSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  runId: z
    .string()
    .optional()
    .describe(
      'The run id given to qa.spoke_record_input. Defaults to the run with the newest spoke records.',
    ),
});

/**
 * `qa.run_metrics` (P4-10): how a run of the agent layer was carried out, from the spoke I/O store
 * and the `agents` budgets.
 */
export const runMetricsTool: ToolDefinition<typeof InputSchema, typeof RunMetricsSchema> = {
  name: 'qa.run_metrics',
  description:
    'Returns how a run of the agent layer was carried out, read from the spoke I/O store and the ' +
    'agents budgets of .qa/config.yaml only: dispatch counts (tasks, attempts, valid and error ' +
    'responses, unanswered), retries used against agents.retries, wall-clock and busy time, the ' +
    'overlap parallel dispatch saved, timed-out attempts, and the most attempts running at once ' +
    'against agents.parallelism. It has no token count or cost: the engine reads no host ' +
    'transcript. Fails with RUN_METRICS_NO_SPOKES when no dispatch was recorded.',
  inputSchema: InputSchema,
  outputSchema: RunMetricsSchema,
  handler: (input) =>
    runRunMetrics(createNodeEngineContext(), input.runId === undefined ? {} : { runId: input.runId }),
};
