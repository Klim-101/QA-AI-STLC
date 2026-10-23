// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, runRegisterExecutedElement } from '@qa-ai-stlc/core';
import { runSyncLocatorModule } from '@qa-ai-stlc/explorer';
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
  locator: z
    .discriminatedUnion('status', [
      z.object({
        status: z.literal('exported'),
        exportName: z
          .string()
          .describe('The function of tests/qa/locators.ts a spec imports for this element.'),
      }),
      z.object({
        status: z.literal('skipped'),
        reason: z.enum(['no-locator-candidate', 'no-name']),
      }),
    ])
    .describe('Whether tests/qa/locators.ts now exports this element, or why it cannot.'),
});

/**
 * `qa.registry_execute_register` (P3-14/P3-15): promotes an ad hoc element pick — found on the
 * page during interactive case execution, not from a prior exploration or pick-mode session — into
 * `.qa/selectors/registry.json` as `source: "execute"`. Re-verifies the selector resolves to
 * exactly one element on the current page first; throws `EXECUTE_SELECTOR_NOT_UNIQUE` otherwise.
 * Then brings `tests/qa/locators.ts` in line with the registry, so a spec can import the element
 * without a new crawl; the result says which export, or why there is none.
 */
export function createRegistryExecuteRegisterTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.registry_execute_register',
    description:
      'Promotes an ad hoc element found by reading the page during interactive case execution ' +
      'into the selector registry, source "execute" and exports it from tests/qa/locators.ts (the result names the export). Call this before an action that navigates ' +
      'away from the element (a form submit, a link) — afterward there is no page left to ' +
      're-verify the selector against.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: async (input) => {
      const registered = await runRegisterExecutedElement(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        selector: input.selector,
        kind: input.kind,
        ...(input.name !== undefined ? { name: input.name } : {}),
      });
      const synced = await runSyncLocatorModule(dependencies.createContext());
      const exported = synced.exports.find((entry) => entry.elementId === registered.elementId);
      const skipped = synced.skipped.find((entry) => entry.elementId === registered.elementId);
      if (exported !== undefined) {
        return { ...registered, locator: { status: 'exported' as const, exportName: exported.name } };
      }
      if (skipped === undefined) {
        throw new QaError(
          'LOCATOR_MODULE_ELEMENT_MISSING',
          `Element "${registered.elementId}" is in the registry but neither exported nor skipped by the locator module`,
          {
            remediation: 'Run "qa explore" to regenerate tests/qa/locators.ts, then report this as a defect.',
          },
        );
      }
      return { ...registered, locator: { status: 'skipped' as const, reason: skipped.reason } };
    },
  };
}
