// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserFill } from '@qa-ai-stlc/core';
import { EvidenceSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import {
  SessionIdInputSchema,
  toBrowserOperationContext,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = SessionIdInputSchema.extend({
  selector: z.string().describe('A Playwright selector for the field to type into.'),
  value: z.string().describe('The text to type. It is never written to evidence, only its length.'),
});

const OutputSchema = z.object({
  sessionId: z.string(),
  selector: z.string(),
  valueLength: z.number(),
  url: z.string(),
  evidence: EvidenceSchema,
});

/** `qa.browser_fill` (P2-06): types into one field and registers the fill as evidence. */
export function createBrowserFillTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof OutputSchema> {
  return {
    name: 'qa.browser_fill',
    description:
      'Types a value into one field in an open browser session and records the fill as ' +
      'evidence. The evidence names the field and how much was typed, never the value itself, ' +
      'so filling a credential leaves no secret in .qa/.',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
    handler: (input) => runBrowserFill(toBrowserOperationContext(dependencies), input),
  };
}
