// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runSpokeRecordOutput } from '@qa-ai-stlc/core';
import { SpokeResultSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  runId: z.string().describe('The run id given to qa.spoke_record_input.'),
  attempt: z.number().int().positive().describe('The attempt number qa.spoke_record_input returned.'),
  result: SpokeResultSchema.describe(
    'The spoke result exactly as it came back, before the hub validates its payload.',
  ),
});

const OutputSchema = z.object({
  attempt: z.number().int(),
  outputPath: z.string(),
  status: z.enum(['ok', 'error']),
  wasRedacted: z.boolean().describe('True when a secret in the result was replaced before storing.'),
  wasAlreadyRecorded: z
    .boolean()
    .describe('True when the identical result was already stored for this attempt.'),
});

/**
 * `qa.spoke_record_output` (P4-01): the hub records what a spoke returned, before validating it.
 */
export const spokeRecordOutputTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.spoke_record_output',
  description:
    'Records a spoke result exactly as received, next to the input of the same attempt. Call it as ' +
    'soon as a spoke returns and before validating the payload. Fails with SPOKE_OUTPUT_WITHOUT_INPUT ' +
    'if that attempt has no recorded input, and with SPOKE_OUTPUT_EXISTS if the attempt already has a ' +
    'different output (a record is never rewritten; re-dispatching is a new attempt), and with ' +
    'SPOKE_TIMEOUT_EXCEEDED if the result came back after agents.spokeTimeoutSeconds (nothing is ' +
    'stored; treat the attempt as failed). Recording the identical result again is a safe no-op. ' +
    'Secrets are redacted before storing.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runSpokeRecordOutput(createNodeEngineContext(), {
      runId: input.runId,
      attempt: input.attempt,
      result: input.result,
    }),
};
