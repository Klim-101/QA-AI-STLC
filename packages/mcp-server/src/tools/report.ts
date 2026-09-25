// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runReport } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  runId: z.string().optional().describe('A specific run id to report on. Defaults to the most recent run.'),
  format: z
    .enum(['markdown', 'html'])
    .optional()
    .describe('The rendered format for the run summary and traceability matrix. Defaults to "markdown".'),
});

const OutputSchema = z.object({
  runId: z.string(),
  runRecordPath: z.string(),
  format: z.enum(['markdown', 'html']),
  runSummary: z.string(),
  traceabilityMatrix: z.string(),
});

/**
 * `qa.report` (P3-08, ADR-002): the same `runReport` core call `qa report` uses — renders a run's
 * summary plus the current requirement → case → result → evidence traceability matrix from the
 * canonical JSON already recorded under `.qa/`, with no hand-written report path. Fails with
 * `REPORT_NO_RUNS` if `qa run` has never run, or `REPORT_RUN_NOT_FOUND` for an unknown `runId`.
 */
export const reportTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.report',
  description:
    'Renders a run summary and the current requirement -> case -> result -> evidence traceability ' +
    'matrix as Markdown or HTML, from the canonical JSON already recorded under .qa/. Defaults to ' +
    'the most recently started run and Markdown format.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const result = await runReport(createNodeEngineContext(), {
      ...(input.runId !== undefined ? { runId: input.runId } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
    });
    return {
      runId: result.runId,
      runRecordPath: result.runRecordPath,
      format: result.format,
      runSummary: result.runSummary,
      traceabilityMatrix: result.traceabilityMatrix,
    };
  },
};
