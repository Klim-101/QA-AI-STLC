// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserPress } from '@qa-ai-stlc/core';
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
  key: z.string().min(1).describe('A key or chord in Playwright spelling: Enter, Escape, Tab, Control+a.'),
  ...ELEMENT_TARGET_FIELDS,
  stepId: z
    .string()
    .optional()
    .describe(
      "'step-<N>', N the case step's 1-based position this key press performs, when executing a registered case.",
    ),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  key: z.string().describe('The key as recorded; a lone character is replaced by [character].'),
  selector: z.string().optional(),
  url: z.string(),
  evidence: EvidenceSchema,
});

/** `qa.browser_press` (P6-56): presses a key or chord and registers it as evidence. */
export function createBrowserPressTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_press',
    description:
      'Presses a key or chord (Enter, Escape, Tab, Control+a) in an open browser session and ' +
      'records it as evidence. With `selector` or a snapshot `ref` the element is focused first; ' +
      'with neither the key goes to whatever has focus. Safe mode still blocks any non-GET ' +
      'request the key sets off, so Enter on a form never submits it. To type text use ' +
      'qa.browser_fill; a lone character is not recorded. Returns the URL after the key press.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runBrowserPress(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        key: input.key,
        ...toElementTarget(input),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
