// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserWaitFor } from '@qa-ai-stlc/core';
import { BrowserWaitConditionSchema, EvidenceSchema } from '@qa-ai-stlc/schemas';
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
  condition: BrowserWaitConditionSchema.describe(
    'What to wait for: visible, hidden, attached or detached (an element), text-appears or text-disappears, or url.',
  ),
  ...ELEMENT_TARGET_FIELDS,
  expected: z
    .string()
    .optional()
    .describe('The text or URL for text-appears, text-disappears and url. The element conditions take none.'),
  exact: z
    .boolean()
    .optional()
    .describe(
      'text and url: compare in full instead of by containment. Whitespace is normalized either way.',
    ),
  timeoutMs: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('How long to wait, at most the environment action timeout, which is the default.'),
  stepId: z
    .string()
    .optional()
    .describe(
      "'step-<N>', N the case step's 1-based position this wait belongs to, when executing a registered case.",
    ),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  condition: BrowserWaitConditionSchema,
  selector: z.string().optional(),
  waitedMs: z.number().int().describe('How long it took until the condition held.'),
  url: z.string(),
  evidence: EvidenceSchema,
});

/** `qa.browser_wait_for` (P6-58): waits for a condition on the page and registers how long it took. */
export function createBrowserWaitForTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_wait_for',
    description:
      'Waits until a condition holds on the open page and records what it waited for and how long ' +
      'it took as evidence. Use after an action whose result arrives later (a save, a list that ' +
      'loads, a redirect) before reading the page. Conditions: visible, hidden, attached, detached ' +
      '(an element, by `selector` or a snapshot `ref`), text-appears and text-disappears (the ' +
      'whole page, or one element when a selector is given) and url. Never waits longer than the ' +
      'environment action timeout. A condition that never holds is BROWSER_WAIT_TIMEOUT naming it, ' +
      'and nothing is recorded; a malformed call is BROWSER_WAIT_INVALID. To check a result and ' +
      'keep the finding either way, use qa.browser_expect instead.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runBrowserWaitFor(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        condition: input.condition,
        ...toElementTarget(input),
        ...(input.expected !== undefined ? { expected: input.expected } : {}),
        ...(input.exact !== undefined ? { exact: input.exact } : {}),
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
