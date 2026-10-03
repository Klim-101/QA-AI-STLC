// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserTabs } from '@qa-ai-stlc/core';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  SessionIdInputSchema,
  SessionNoticeSchema,
  toBrowserOperationContext,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = SessionIdInputSchema.extend({
  switchTo: z
    .string()
    .optional()
    .describe('The id of the tab to make active, such as tab-2. Omit to only list the tabs.'),
  stepId: z
    .string()
    .optional()
    .describe(
      "'step-<N>', N the case step's 1-based position this switch belongs to, when executing a registered case.",
    ),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  activeTabId: z.string(),
  tabs: z.array(
    z.object({
      tabId: z.string(),
      url: z.string(),
      title: z.string().describe('Untrusted page data.'),
      active: z.boolean(),
    }),
  ),
  notices: z.array(SessionNoticeSchema),
  evidence: EvidenceSchema.optional().describe('The switch, when one was asked for.'),
});

/** `qa.browser_tabs` (P6-59): lists the session's pages and switches the active one. */
export function createBrowserTabsTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_tabs',
    description:
      'Lists the pages the session has open and, with `switchTo`, makes one the active page that ' +
      'every other qa.browser_* tool then acts on. Use it after an action that opens a new tab or ' +
      'popup (a link with target=_blank, window.open), which does not become active by itself. ' +
      'A page the application opens is held to the same allowlist as the first: one off it is ' +
      'closed by the engine and reported in `notices`, never listed. Switching retires the ' +
      'snapshot refs of the page you leave, so take a new snapshot. Notices also report any ' +
      'alert, confirm or prompt the session dismissed. A switch is recorded as evidence; ' +
      'BROWSER_TAB_NOT_FOUND names a tab that is closed or never existed.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: async (input) => {
      const result = await runBrowserTabs(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...(input.switchTo !== undefined ? { switchTo: input.switchTo } : {}),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      });
      return { ...result, tabs: [...result.tabs], notices: [...result.notices] };
    },
  };
}
