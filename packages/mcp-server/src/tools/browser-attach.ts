// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserAttach } from '@qa-ai-stlc/core';
import { listWidgetTargets, resolveComponentLibraryProfile } from '@qa-ai-stlc/explorer';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { toBrowserOperationContext, type BrowserToolDependencies } from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  endpoint: z
    .string()
    .min(1)
    .describe(
      'DevTools endpoint of a Chrome on this machine started with --remote-debugging-port, for ' +
        'example http://127.0.0.1:9222. Only localhost, 127.0.0.0/8 and ::1 are accepted.',
    ),
  environment: z
    .string()
    .optional()
    .describe('Environment name from config.yaml. Required when there is more than one.'),
  executionMode: z
    .boolean()
    .optional()
    .describe(
      'Interactive case execution only (ADR-0009): allows a non-GET request through safe mode. ' +
        'The domain allowlist still applies unconditionally.',
    ),
  dialogPolicy: z
    .enum(['dismiss', 'accept'])
    .optional()
    .describe('What the session does with an alert, confirm or prompt: dismiss (the default) or accept.'),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  runId: z.string(),
  environment: z.string(),
  baseUrl: z.string(),
  allowlist: z.array(z.string()),
  pageUrl: z.string(),
  notes: z.array(z.string()),
  evidence: EvidenceSchema,
});

/**
 * `qa.browser_attach` (P6-50): the session an operator-started, already signed-in browser becomes,
 * for an application the engine cannot sign into itself (SSO, MFA).
 */
export function createBrowserAttachTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_attach',
    description:
      'Attaches to a Chrome the operator started with --remote-debugging-port and already signed ' +
      'in to the application, and returns a browser session id every other qa.browser_* tool ' +
      'takes. Use it only when the engine cannot sign in itself (SSO, MFA); otherwise use ' +
      'qa.browser_open. The endpoint must be on this machine. The session drives the first open ' +
      'page that is on the environment allowlist, under safe mode, and its sessionStorage and ' +
      'request headers can then feed a from-browser API auth profile. Request headers are ' +
      'observed only from attachment onward. Closing the session with qa.browser_close ' +
      'disconnects and never closes the operator’s browser.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    async handler(input) {
      const result = await runBrowserAttach(toBrowserOperationContext(dependencies), {
        endpoint: input.endpoint,
        ...(input.environment !== undefined ? { environment: input.environment } : {}),
        ...(input.executionMode !== undefined ? { executionMode: input.executionMode } : {}),
        ...(input.dialogPolicy !== undefined ? { dialogPolicy: input.dialogPolicy } : {}),
        resolveLibraryBusySelectors: (library) =>
          resolveComponentLibraryProfile(library)?.busySelectors ?? [],
        resolveLibraryWidgets: (library) => listWidgetTargets(resolveComponentLibraryProfile(library)),
      });
      return { ...result, allowlist: [...result.allowlist], notes: [...result.notes] };
    },
  };
}
