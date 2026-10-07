// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runRcaAdd } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  path: z.string().describe('Project-relative path to a root cause analysis written as JSON (RcaSchema).'),
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
    'Validates a root cause analysis written as JSON at the given path and registers it under ' +
    'artifacts/rca/<defect-id>.json with status "draft". Facts and hypotheses stay separate: put ' +
    'only what the evidence established in "facts", and give every hypothesis a confidence and the ' +
    'evidence that would confirm it. Fails with RCA_DEFECT_NOT_ACCEPTED unless the defect is ' +
    'accepted (qa.defect_accept). Review is a separate operator step (qa.rca_approve).',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) => runRcaAdd(createNodeEngineContext(), { path: input.path }),
};
