// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runRcaAdd } from '@qa-ai-stlc/core';
import { RcaSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  rca: RcaSchema.optional().describe(
    'The root cause analysis itself (RcaSchema). Prefer this: it needs no file in the project.',
  ),
  path: z
    .string()
    .optional()
    .describe('Project-relative path to a root cause analysis already written as JSON (RcaSchema).'),
});

const OutputSchema = z.object({
  defectId: z.string(),
  rcaPath: z.string(),
});

/**
 * `qa.rca_add` (P6-14): the same `runRcaAdd` core call `qa rca add` uses. Registers an RCA under
 * `artifacts/rca/<defect-id>.json` for an accepted defect; it stays `draft` until reviewed.
 */
export const rcaAddTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.rca_add',
  description:
    'Validates a root cause analysis, given inline as "rca" or as the JSON file at "path" (exactly ' +
    'one), and registers it under artifacts/rca/<defect-id>.json with status "draft". One that does ' +
    'not match its schema fails with RCA_INVALID, whose remediation names every invalid field and ' +
    'the values it allows. Facts and hypotheses stay separate: put ' +
    'only what the evidence established in "facts", and give every hypothesis a confidence and the ' +
    'evidence that would confirm it. Fails with RCA_DEFECT_NOT_ACCEPTED unless the defect is ' +
    'accepted (qa.defect_accept). Review is a separate operator step (qa.rca_approve).',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runRcaAdd(createNodeEngineContext(), {
      ...(input.path === undefined ? {} : { path: input.path }),
      ...(input.rca === undefined ? {} : { rca: input.rca }),
    }),
};
