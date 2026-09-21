// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserNavigate } from '@qa-ai-stlc/core';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  SessionIdInputSchema,
  toBrowserOperationContext,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = SessionIdInputSchema.extend({
  url: z.string().describe('Absolute URL to open. Its host must be on the session allowlist.'),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  url: z.string(),
  title: z.string(),
  httpStatus: z.number().optional(),
  evidence: EvidenceSchema,
});

/**
 * `qa.browser_navigate` (P2-06): navigates an open session and registers the navigation as
 * evidence before returning.
 */
export function createBrowserNavigateTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_navigate',
    description:
      'Navigates an open browser session to a URL and records the navigation as evidence. ' +
      'Fails with BROWSER_URL_NOT_ALLOWED when the host is not on the session allowlist, and ' +
      'with BROWSER_SESSION_NOT_FOUND or BROWSER_SESSION_EXPIRED when the session is gone. ' +
      'Returns where the page actually landed, which a redirect can change.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) => runBrowserNavigate(toBrowserOperationContext(dependencies), input),
  };
}
