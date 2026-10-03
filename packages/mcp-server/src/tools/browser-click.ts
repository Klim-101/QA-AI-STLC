// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserClick } from '@qa-ai-stlc/core';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  ELEMENT_TARGET_FIELDS,
  NOTICES_OUTPUT_FIELD,
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
      "'step-<N>', N the case step's 1-based position this click performs, when executing a registered case.",
    ),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  selector: z.string(),
  url: z.string(),
  evidence: EvidenceSchema,
  ...NOTICES_OUTPUT_FIELD,
});

/** `qa.browser_click` (P2-06): clicks one element and registers the click as evidence. */
export function createBrowserClickTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_click',
    description:
      'Clicks one element (by `selector` or a snapshot `ref`) in an open browser session and records the click as evidence. Use ' +
      'after qa.browser_navigate. Safe mode still blocks any non-GET request the click sets ' +
      'off, so a form is never actually submitted. Returns the URL after the click.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runBrowserClick(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...toElementTarget(input),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
