// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runRegisterExecutedElement } from '@qa-ai-stlc/core';
import { z } from 'zod';
import {
  SessionIdInputSchema,
  toBrowserOperationContext,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = SessionIdInputSchema.extend({
  selector: z
    .string()
    .describe(
      'A Playwright selector for an element interactive execution is using, resolved against ' +
        "the session's current page. Call this before an action that navigates away (a form " +
        'submit, a link), since the element must still be on the page to re-verify.',
    ),
  kind: z.string().describe('The element\'s role or type, e.g. "button", "textbox".'),
  name: z.string().optional().describe("The element's accessible name, if it has one."),
});

const OutputSchema = z.object({
  elementId: z.string(),
  created: z.boolean(),
});

/**
 * `qa.registry_execute_register` (P3-14/P3-15): promotes an ad hoc element pick — found on the
 * page during interactive case execution, not from a prior exploration or pick-mode session — into
 * `.qa/selectors/registry.json` as `source: "execute"`. Re-verifies the selector resolves to
 * exactly one element on the current page first; throws `EXECUTE_SELECTOR_NOT_UNIQUE` otherwise.
 */
export function createRegistryExecuteRegisterTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.registry_execute_register',
    description:
      'Promotes an ad hoc element found by reading the page during interactive case execution ' +
      'into the selector registry, source "execute". Call this before an action that navigates ' +
      'away from the element (a form submit, a link) — afterward there is no page left to ' +
      're-verify the selector against.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runRegisterExecutedElement(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        selector: input.selector,
        kind: input.kind,
        ...(input.name !== undefined ? { name: input.name } : {}),
      }),
  };
}
