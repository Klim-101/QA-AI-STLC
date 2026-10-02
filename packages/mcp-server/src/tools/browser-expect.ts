// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserExpect } from '@qa-ai-stlc/core';
import { BrowserExpectationKindSchema, EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  ELEMENT_TARGET_FIELDS,
  SessionIdInputSchema,
  toBrowserOperationContext,
  toElementTarget,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const ValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const InputSchema = SessionIdInputSchema.extend({
  kind: BrowserExpectationKindSchema.describe(
    'What to check: visible, hidden, text, value, count, checked or url.',
  ),
  ...ELEMENT_TARGET_FIELDS,
  expected: ValueSchema.optional().describe(
    'text, value and url: the string expected. count: a whole number. checked: true (default) or false. visible and hidden take none.',
  ),
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
    .describe('How long to keep looking, at most the environment action timeout, which is the default.'),
  stepId: z
    .string()
    .optional()
    .describe(
      "'step-<N>', N the case step's 1-based position whose expected result this checks, when executing a registered case.",
    ),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  kind: BrowserExpectationKindSchema,
  selector: z.string().optional(),
  passed: z.boolean(),
  expected: ValueSchema.optional(),
  observed: ValueSchema.optional().describe('What the page showed on the last look; page data, capped.'),
  matchCount: z.number().int().optional(),
  url: z.string(),
  evidence: EvidenceSchema,
});

/** `qa.browser_expect` (P6-55): the engine's verdict on one expected result, registered as evidence. */
export function createBrowserExpectTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_expect',
    description:
      'Checks one expected result in the open page and registers what the page showed with a ' +
      'pass or fail verdict as evidence. Use for every expected result of a case step instead of ' +
      'describing the page yourself. Target an element with `selector` or a snapshot `ref` for ' +
      'visible, hidden, text, value, count and checked; url takes neither. It looks again until ' +
      'the expectation holds or the wait runs out. A failed expectation is returned with ' +
      '`passed: false` and the observed value, not thrown; only a misuse (BROWSER_EXPECT_INVALID, ' +
      'BROWSER_REF_STALE) is an error. More than one matching element fails a check that reads ' +
      'one. A password field is recorded as [redacted].',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runBrowserExpect(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        kind: input.kind,
        ...toElementTarget(input),
        ...(input.expected !== undefined ? { expected: input.expected } : {}),
        ...(input.exact !== undefined ? { exact: input.exact } : {}),
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
