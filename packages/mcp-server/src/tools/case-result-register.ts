// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runRegisterCaseResult } from '@qa-ai-stlc/core';
import { RunResultFailureSchema, RunResultStatusSchema, TestTypeSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  testCaseId: z.string().describe('The id of the test case this run executed.'),
  testType: TestTypeSchema,
  runId: z.string().describe("The run id every piece of this execution's evidence was registered under."),
  status: RunResultStatusSchema.describe(
    'Supplied by you after interpreting the evidence this run produced — the engine never ' +
      'computes a verdict itself.',
  ),
  startedAt: z.string().describe('ISO timestamp for when execution of this case began.'),
  evidenceIds: z.array(z.string()).describe('Every evidence id this execution produced, tied together.'),
  failure: RunResultFailureSchema.optional().describe('Required when status is "failed".'),
});

const OutputSchema = z.object({
  runResultPath: z.string(),
  id: z.string(),
});

/**
 * `qa.case_result_register` (P3-14/P3-15): ties every piece of evidence an interactive execution
 * produced together into one registered `RunResultSchema` value. You, not the engine, decide
 * `status` — read back the registered evidence for each `evidenceIds` entry and judge it against
 * the case's expected result before calling this, the same "the engine records, it does not
 * fabricate a verdict" principle already applied to every other execution tool.
 */
export const caseResultRegisterTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.case_result_register',
  description:
    'Registers a run result tying together every evidence id an interactive case execution ' +
    'produced. You supply "status" after interpreting that evidence yourself — the engine never ' +
    'computes a verdict. "failure" is required when status is "failed".',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runRegisterCaseResult(createNodeEngineContext(), {
      testCaseId: input.testCaseId,
      testType: input.testType,
      runId: input.runId,
      status: input.status,
      startedAt: input.startedAt,
      evidenceIds: input.evidenceIds,
      ...(input.failure !== undefined ? { failure: input.failure } : {}),
    }),
};
