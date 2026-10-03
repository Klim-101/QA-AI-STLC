// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserCheck } from '@qa-ai-stlc/core';
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
  checked: z.boolean().optional().describe('The state to leave the box in: true (default) or false.'),
  stepId: z
    .string()
    .optional()
    .describe(
      "'step-<N>', N the case step's 1-based position this action performs, when executing a registered case.",
    ),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  selector: z.string(),
  checked: z.boolean().describe('The state read back from the box after setting it.'),
  url: z.string(),
  evidence: EvidenceSchema,
  ...NOTICES_OUTPUT_FIELD,
});

/** `qa.browser_check` (P6-56): sets a checkbox or radio to a state and reads it back. */
export function createBrowserCheckTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_check',
    description:
      'Sets one checkbox, radio or role=checkbox widget (by `selector` or a snapshot `ref`) to ' +
      'checked or unchecked, reads the box back and records the state as evidence. Use instead of ' +
      'qa.browser_click for a box, so the result is the state the page showed rather than a click. ' +
      'Fails with BROWSER_CHECK_NOT_APPLIED, and registers nothing, when the page leaves the box ' +
      'in another state.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runBrowserCheck(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...toElementTarget(input),
        ...(input.checked !== undefined ? { checked: input.checked } : {}),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
