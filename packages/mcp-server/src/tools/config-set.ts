// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runConfigSet } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  key: z
    .string()
    .describe('The setting to change: testing.e2e, testing.api, testing.a11y or testing.security.'),
  value: z.string().describe('"in-scope", "out-of-scope" or "undecided".'),
});

const OutputSchema = z.object({ key: z.string(), value: z.string() });

/**
 * `qa.config_set` (P6-48): the same `runConfigSet` core call `qa config set` uses — changes one
 * testing type's scope decision in the resolved project's committed `.qa/config.yaml` only.
 */
export const configSetTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.config_set',
  description:
    'Changes one testing type scope decision (testing.e2e, testing.api, testing.a11y or ' +
    'testing.security) to in-scope, out-of-scope or undecided in the project .qa/config.yaml. ' +
    'Use it only for an answer the operator gave. Reopening a decided scope invalidates ' +
    'approvals that depended on it the next time qa.approve or qa.validate runs.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) => runConfigSet(createNodeEngineContext(), input),
};
