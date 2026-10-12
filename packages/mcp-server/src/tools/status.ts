// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runStatus } from '@qa-ai-stlc/core';
import { PipelineStateSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({});

const NextActionSchema = z.object({
  kind: z.enum(['phase', 'explore', 'execute', 'generate']),
  title: z.string(),
  detail: z.string(),
  skill: z.string(),
  tool: z.string(),
  cases: z.object({ ids: z.array(z.string()), total: z.number() }).optional(),
});

const OutputSchema = z.object({
  state: PipelineStateSchema,
  nextActions: z.array(NextActionSchema),
});

/**
 * `qa.status` (#634): the same `runStatus` core call `qa status` uses. The pipeline ends at `cases`;
 * this names what comes after it, so the operator is never told there is nothing to do.
 */
export const statusTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.status',
  description:
    'Returns the pipeline gates and an ordered list of next actions: the unfinished phase, or, once ' +
    'every phase is approved, exploring the application, executing approved cases that have no ' +
    'passing result, and generating tests for passing ones. Each action names the skill and the first ' +
    'tool to use. Call it at the start of a session and after each gate approval, and relay the ' +
    'first action to the operator instead of saying there is nothing left.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler() {
    const report = await runStatus(createNodeEngineContext());
    return {
      state: report.state,
      nextActions: report.nextActions.map((action) => ({
        kind: action.kind,
        title: action.title,
        detail: action.detail,
        skill: action.skill,
        tool: action.tool,
        ...(action.cases === undefined
          ? {}
          : { cases: { ids: [...action.cases.ids], total: action.cases.total } }),
      })),
    };
  },
};
