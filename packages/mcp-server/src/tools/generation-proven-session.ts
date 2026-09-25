// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runFindProvenSession } from '@qa-ai-stlc/core';
import { ProvenSessionSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  testCaseId: z.string().describe('The id of the registered test case to look up a proven session for.'),
});

const OutputSchema = z.object({
  found: z.boolean(),
  session: ProvenSessionSchema.optional().describe('Present only when "found" is true.'),
});

/**
 * `qa.generation_proven_session` (P3-07): reads back a case's most recently proven `qa-execute`
 * session (P3-15) — its latest `passed` `RunResult`, with evidence grouped by the `step-<N>` id
 * each action's own content carries — for `qa-generate-tests` to codify into a spec. `found: false`
 * means the case has no passing session yet, or one exists but predates the `stepId` convention;
 * either way, generation from proven steps is not possible until `qa-execute` runs (again).
 */
export const generationProvenSessionTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.generation_proven_session',
  description:
    "Reads back a test case's most recently proven qa-execute session, with steps recovered " +
    'from evidence and grouped by "step-<N>" id. Returns found: false when there is no passing ' +
    'session yet, or one exists but never tagged its evidence with a stepId.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) => runFindProvenSession(createNodeEngineContext(), { testCaseId: input.testCaseId }),
};
