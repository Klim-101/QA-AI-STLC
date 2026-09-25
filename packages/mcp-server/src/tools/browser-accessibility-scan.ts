// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserAccessibilityScan } from '@qa-ai-stlc/core';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  SessionIdInputSchema,
  toBrowserOperationContext,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = SessionIdInputSchema;

const OutputSchema = z.object({
  sessionId: z.string(),
  url: z.string(),
  evidence: EvidenceSchema,
  violationCount: z.number(),
});

/**
 * `qa.browser_accessibility_scan` (P3-14/P3-15): runs a real axe-core scan against an open
 * session's current page and registers the raw result as evidence. `violationCount` is a count,
 * not a verdict — interpret it against the case's expected result before reporting pass or fail.
 */
export function createBrowserAccessibilityScanTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_accessibility_scan',
    description:
      'Runs a real axe-core scan against an open session\'s current page for the "a11y" test ' +
      'type and registers the raw scan result as evidence. Returns a violation count only — the ' +
      "engine never decides pass or fail; compare the count and violations against the case's " +
      'expected result yourself.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) => runBrowserAccessibilityScan(toBrowserOperationContext(dependencies), input),
  };
}
