// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserOpen } from '@qa-ai-stlc/core';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { toBrowserOperationContext, type BrowserToolDependencies } from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  environment: z
    .string()
    .optional()
    .describe('Environment name from config.yaml. Required when there is more than one.'),
  executionMode: z
    .boolean()
    .optional()
    .describe(
      'Interactive case execution only (ADR-0009): allows a non-GET request (a real form ' +
        'submission) through safe mode, so an e2e case can be proven to actually work. The ' +
        'domain allowlist still applies unconditionally. Never set this for exploration or pick mode.',
    ),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  runId: z.string(),
  environment: z.string(),
  baseUrl: z.string(),
  allowlist: z.array(z.string()),
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
        ...(input.executionMode !== undefined ? { executionMode: input.executionMode } : {}),
      });
      return { ...result, allowlist: [...result.allowlist] };
    },
  };
}
