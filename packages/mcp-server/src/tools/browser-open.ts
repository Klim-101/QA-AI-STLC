// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserOpen } from '@qa-ai-stlc/core';
import { listWidgetTargets, resolveComponentLibraryProfile } from '@qa-ai-stlc/explorer';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { toBrowserOperationContext, type BrowserToolDependencies } from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  environment: z
    .string()
    .optional()
    .describe('Environment name from config.yaml. Required when there is more than one.'),
  caseId: z
    .string()
    .optional()
    .describe(
      'Interactive case execution only (ADR-0009): the id of a case in the approved case set. Allows ' +
        'a non-GET request (a real form submission) through safe mode, so the case can be proven to ' +
        'actually work. Refused with EXECUTION_CASE_NOT_APPROVED until the operator approves the ' +
        'cases gate. The domain allowlist still applies unconditionally. Omit it for exploration or pick mode.',
    ),
  identity: z
    .string()
    .optional()
    .describe(
      'Identity name from config.yaml. The session signs in as it before the first navigation, so ' +
        'pages behind a login open authenticated. The result names the identity, never its credentials or session.',
    ),
  cdpEndpointUrl: z
    .string()
    .optional()
    .describe('Required, and only used, when the identity uses cdp-attach.'),
  dialogPolicy: z
    .enum(['dismiss', 'accept'])
    .optional()
    .describe(
      'What the session does with an alert, confirm or prompt: dismiss (the default) or accept. ' +
        'Either way each dialog is recorded as evidence and reported in a later result. Accepting ' +
        'only lets the page carry on; safe mode still blocks any non-GET request that follows.',
    ),
  headed: z
    .boolean()
    .optional()
    .describe(
      'Opens a visible browser window so the operator can watch the session or sign in by hand. ' +
        'Defaults to the "headed" setting of the environment, then to false (headless). Safe mode, ' +
        'the allowlist and evidence registration are unchanged. Fails with BROWSER_HEADED_UNAVAILABLE ' +
        'on a machine without a display, and with BROWSER_EXITED_DURING_OPEN when the browser is ' +
        'gone right after it launched. A window closed later ends the session: its next call fails ' +
        'with BROWSER_SESSION_LOST.',
    ),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  runId: z.string(),
  environment: z.string(),
  baseUrl: z.string(),
  allowlist: z.array(z.string()),
  headed: z.boolean().describe('True when the session runs in a visible window, false when headless.'),
  identity: z.string().optional(),
  evidence: EvidenceSchema,
});

/**
 * `qa.browser_open` (P2-06): starts the one browser an agent is allowed to drive (ADR-005).
 * Everything the session then does is registered as evidence under its own run id.
 */
export function createBrowserOpenTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_open',
    description:
      'Opens a browser session against a configured environment and returns its session id, ' +
      'which every other qa.browser_* tool takes. The session runs in safe mode: non-GET ' +
      'requests are blocked, and navigation is limited to the environment allowlist. Close it ' +
      'with qa.browser_close when finished; an idle session is closed automatically.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    async handler(input) {
      const result = await runBrowserOpen(toBrowserOperationContext(dependencies), {
        ...(input.environment !== undefined ? { environment: input.environment } : {}),
        ...(input.caseId !== undefined ? { caseId: input.caseId } : {}),
        ...(input.identity !== undefined ? { identity: input.identity } : {}),
        ...(input.cdpEndpointUrl !== undefined ? { cdpEndpointUrl: input.cdpEndpointUrl } : {}),
        ...(input.dialogPolicy !== undefined ? { dialogPolicy: input.dialogPolicy } : {}),
        ...(input.headed !== undefined ? { headed: input.headed } : {}),
        resolveLibraryBusySelectors: (library) =>
          resolveComponentLibraryProfile(library)?.busySelectors ?? [],
        resolveLibraryWidgets: (library) => listWidgetTargets(resolveComponentLibraryProfile(library)),
      });
      return { ...result, allowlist: [...result.allowlist] };
    },
  };
}
