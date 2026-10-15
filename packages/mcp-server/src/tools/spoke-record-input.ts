// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runSpokeRecordInput } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  runId: z
    .string()
    .describe(
      'The run the dispatch belongs to: a qa.run run id, or one stable id the hub picks for the session.',
    ),
  spokeId: z.string().describe('The spoke definition being dispatched, for example "explorer-page".'),
  taskId: z.string().describe('This task of the spoke, for example one page or one test case.'),
  task: z.string().describe('The task description the spoke is given.'),
  context: z
    .unknown()
    .optional()
    .describe(
      'The minimal context given with the task (JSON). Pass references to registered artifacts, not bulk data.',
    ),
});

const OutputSchema = z.object({
  attempt: z
    .number()
    .int()
    .describe('The attempt number the engine assigned; pass it to qa.spoke_record_output.'),
  inputPath: z.string(),
  wasRedacted: z.boolean().describe('True when a secret in the task or context was replaced before storing.'),
});

/**
 * `qa.spoke_record_input` (P4-01): the hub records what it gave a spoke before dispatching it.
 */
export const spokeRecordInputTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.spoke_record_input',
  description:
    'Records the task and minimal context the hub is about to give a spoke, under ' +
    'runs/<run-id>/spokes/<spoke>/<task>/attempt-<n>/input.json, and returns the attempt number the ' +
    'engine assigned. Call it before every dispatch, including a re-dispatch after a failed validation ' +
    '(that is the next attempt of the same task). Secrets are redacted before storing. Names must be ' +
    'single path segments (letters, digits, ".", "_", "-"); a record over 256 KiB is refused, so pass ' +
    'references to registered artifacts rather than their content.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runSpokeRecordInput(createNodeEngineContext(), {
      runId: input.runId,
      spokeId: input.spokeId,
      taskId: input.taskId,
      task: input.task,
      ...(input.context === undefined ? {} : { context: input.context }),
    }),
};
