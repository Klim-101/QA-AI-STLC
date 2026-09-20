// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runScope } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  from: z.enum(['file', 'text']).describe('Where to read requirements from.'),
  path: z
    .string()
    .optional()
    .describe('Project-relative path to a Markdown file. Required when from is "file".'),
  content: z.string().optional().describe('Literal Markdown text. Required when from is "text".'),
  label: z.string().optional().describe('A short label for the text source. Required when from is "text".'),
});

const OutputSchema = z.object({
  scopePath: z.string(),
  added: z.number(),
  updated: z.number(),
  total: z.number(),
});

/**
 * `qa.scope` (P2-05): the same `runScope` core call `qa scope` uses — deterministically extracts
 * `## Heading` requirements from a local Markdown source and upserts them into
 * `artifacts/scope.json` by id (development plan section 2.4, 2.7 step 4). The framework never
 * fetches requirements from a tracker (AGENTS.md 2.3).
 */
export const scopeTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.scope',
  description:
    'Extracts requirements from a local Markdown file or literal text (one "## Heading" per ' +
    'requirement) and upserts them by id into artifacts/scope.json. Call again with the same ' +
    'headings to update requirements instead of duplicating them. Never fetches from an issue ' +
    'tracker or wiki.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runScope(createNodeEngineContext(), {
      from: input.from,
      ...(input.path !== undefined ? { path: input.path } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
    }),
};
