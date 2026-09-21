// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserSnapshot } from '@qa-ai-stlc/core';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  SessionIdInputSchema,
  toBrowserOperationContext,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = SessionIdInputSchema.extend({
  fullPage: z.boolean().optional().describe('Captures the whole scrollable page, not just the viewport.'),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  url: z.string(),
  title: z.string(),
  screenshot: EvidenceSchema,
  accessibilityTree: EvidenceSchema,
});

/**
 * `qa.browser_snapshot` (P2-06): the only way to obtain a screenshot, and it registers one
 * before it returns — there is no tool that hands back an unregistered image (ADR-005).
 */
export function createBrowserSnapshotTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_snapshot',
    description:
      'Captures the current page of an open browser session as a PNG plus its accessibility ' +
      'tree, registers both as evidence, and returns their registered paths and hashes. Use to ' +
      'record what a page looked like at a point in an exploratory session. Returns references ' +
      'to the stored files, never image bytes.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) =>
      runBrowserSnapshot(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...(input.fullPage !== undefined ? { fullPage: input.fullPage } : {}),
      }),
  };
}
