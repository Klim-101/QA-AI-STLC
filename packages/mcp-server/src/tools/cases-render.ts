// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runCasesRender } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  id: z.string().describe('The id of a registered test case, e.g. as registered by qa.cases_add.'),
});

const OutputSchema = z.object({
  casePath: z.string(),
  markdown: z.string(),
});

/**
 * `qa.cases_render` (P2-25, ADR-002): the same `runCasesRender` core call `qa cases render` uses
 * — finds the registered test case with the given id under `artifacts/cases/**` and renders it as
 * a numbered Markdown document, so a case can be handed to a stakeholder as a presentable document
 * instead of raw JSON.
 */
export const casesRenderTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.cases_render',
  description:
    'Renders the registered test case with the given id (as registered by qa.cases_add) as a ' +
    'numbered Markdown document: metadata, preconditions, steps and expected result. Fails with ' +
    'CASE_NOT_FOUND if no case with that id is registered.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const result = await runCasesRender(createNodeEngineContext(), { id: input.id });
    return { casePath: result.casePath, markdown: result.markdown };
  },
};
