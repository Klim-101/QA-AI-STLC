// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runSpokeList } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  runId: z.string().describe('The run id the dispatches were recorded under.'),
});

const OutputSchema = z.object({
  runId: z.string(),
  records: z.array(
    z.object({
      spokeId: z.string(),
      taskId: z.string(),
      attempt: z.number().int(),
      inputPath: z.string(),
      outputPath: z.string().optional().describe('Absent while the attempt has no recorded output.'),
      status: z.enum(['ok', 'error']).optional().describe("The recorded output's status, when there is one."),
    }),
  ),
});

/**
 * `qa.spoke_list` (P4-01): what was dispatched in a run, from the spoke I/O store.
 */
export const spokeListTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.spoke_list',
  description:
    'Lists every spoke attempt recorded for a run, ordered by spoke, task and attempt, with the status ' +
    'of its recorded output when there is one. Use it to see how many attempts a task needed and which ' +
    'attempts never returned a result. Returns paths and statuses only, not the recorded content.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const result = await runSpokeList(createNodeEngineContext(), { runId: input.runId });
    return { runId: result.runId, records: result.records.map((record) => ({ ...record })) };
  },
};
