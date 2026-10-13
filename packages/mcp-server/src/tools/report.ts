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
  runId: z.string().optional().describe('Set only when a `qa run` record is reported.'),
  runRecordPath: z.string().optional(),
  format: z.enum(['markdown', 'html']),
  runSummary: z
    .string()
    .optional()
    .describe('Summary of a `qa run` record; absent when only live execution results exist.'),
  interactiveSummary: z
    .string()
    .optional()
    .describe(
      'Results registered by live case execution (qa-execute), one row per case; absent when there are none.',
    ),
  traceabilityMatrix: z.string(),
  a11yConformance: z
    .string()
    .optional()
    .describe('Per-criterion accessibility conformance section; present only when a11y testing is in scope.'),
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
    'matrix as Markdown or HTML, from the canonical JSON already recorded under .qa/. Reports the most ' +
    'recently started `qa run` and, separately, the results registered by live case execution ( ' +
    'qa-execute), so a session that only executed cases still gets a report. Defaults to Markdown.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const result = await runReport(createNodeEngineContext(), {
      ...(input.runId !== undefined ? { runId: input.runId } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
    });
    return {
      ...(result.runId === undefined ? {} : { runId: result.runId }),
      ...(result.runRecordPath === undefined ? {} : { runRecordPath: result.runRecordPath }),
      format: result.format,
      ...(result.runSummary === undefined ? {} : { runSummary: result.runSummary }),
      ...(result.interactiveSummary === undefined ? {} : { interactiveSummary: result.interactiveSummary }),
      traceabilityMatrix: result.traceabilityMatrix,
      ...(result.a11yConformance === undefined ? {} : { a11yConformance: result.a11yConformance }),
    };
  },
};
