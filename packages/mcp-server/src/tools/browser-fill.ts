// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserFill } from '@qa-ai-stlc/core';
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
  value: z
    .string()
    .optional()
    .describe(
      'The text to type. It is never written to evidence, only its length. Give this or `valueFromEnv`.',
    ),
  valueFromEnv: z
    .string()
    .optional()
    .describe(
      'Name of a QA_-prefixed environment variable the engine reads itself, for a password or other ' +
        'credential: the value never appears in this call or its result. Give this or `value`. Never ' +
        'read the variable yourself.',
    ),
  stepId: z
    .string()
    .optional()
    .describe(
      "'step-<N>', N the case step's 1-based position this fill performs, when executing a registered case.",
    ),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  selector: z.string(),
  valueLength: z.number(),
  url: z.string(),
  evidence: EvidenceSchema,
});

/** `qa.browser_fill` (P2-06): types into one field and registers the fill as evidence. */
export function createBrowserFillTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_fill',
    description:
      'Types a value into one field in an open browser session and records the fill as ' +
      'evidence. The evidence names the field and how much was typed, never the value itself, ' +
      'so filling a credential leaves no secret in .qa/. For a credential, pass "valueFromEnv" ' +
      'instead of "value" so the secret never passes through you.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runBrowserFill(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...toElementTarget(input),
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.valueFromEnv !== undefined ? { valueFromEnv: input.valueFromEnv } : {}),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
