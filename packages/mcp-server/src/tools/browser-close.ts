// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserClose } from '@qa-ai-stlc/core';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  SessionIdInputSchema,
  toBrowserOperationContext,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = SessionIdInputSchema;

const BlockedRequestSchema = z.object({
  method: z.string(),
  url: z.string(),
});

const RequestSummarySchema = z.object({
  method: z.string(),
  path: z.string(),
  count: z.number(),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  runId: z.string(),
  blockedRequests: z.array(BlockedRequestSchema),
  requests: z.object({
    allowed: z.array(RequestSummarySchema),
    blocked: z.array(RequestSummarySchema),
  }),
  evidence: EvidenceSchema,
});

/** `qa.browser_close` (P2-06): ends a session, records it, and shuts the browser down. */
export function createBrowserCloseTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_close',
    description:
      'Closes an open browser session, records the close as evidence, and reports every ' +
      'non-GET request safe mode blocked during it, and, by method and path, the non-GET requests the ' +
      'environment lets through (safeNonGetRequests) and the ones blocked. Call when an exploratory session is ' +
      'finished so the browser process does not stay alive.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    async handler(input) {
      const result = await runBrowserClose(toBrowserOperationContext(dependencies), input);
      return {
        ...result,
        blockedRequests: [...result.blockedRequests],
        requests: { allowed: [...result.requests.allowed], blocked: [...result.requests.blocked] },
      };
    },
  };
}
