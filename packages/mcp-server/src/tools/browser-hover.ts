// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserHover } from '@qa-ai-stlc/core';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  ELEMENT_TARGET_FIELDS,
  SessionIdInputSchema,
  toBrowserOperationContext,
  toElementTarget,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = SessionIdInputSchema.extend({
  ...ELEMENT_TARGET_FIELDS,
  stepId: z
    .string()
    .optional()
    .describe(
      "'step-<N>', N the case step's 1-based position this hover performs, when executing a registered case.",
    ),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  selector: z.string(),
  url: z.string(),
  evidence: EvidenceSchema,
});

/** `qa.browser_hover` (P6-56): hovers one element and registers the hover as evidence. */
export function createBrowserHoverTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_hover',
    description:
      'Moves the pointer over one element (by `selector` or a snapshot `ref`) in an open browser ' +
      'session and records the hover as evidence. Use to open a tooltip or a hover menu, then ' +
      'qa.browser_snapshot or qa.browser_expect to see what appeared.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runBrowserHover(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...toElementTarget(input),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
