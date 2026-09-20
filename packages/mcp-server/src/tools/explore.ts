// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runExplore } from '@qa-ai-stlc/explorer';
import { SelectorPolicySchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  environment: z
    .string()
    .optional()
    .describe('Environment name from config.yaml. Required when there is more than one.'),
  identity: z.string().optional().describe('Identity name from config.yaml to sign in with before crawling.'),
  cdpEndpointUrl: z
    .string()
    .optional()
    .describe('Required, and only used, when the identity uses cdp-attach.'),
  policy: SelectorPolicySchema.optional().describe('Overrides config.yaml selectors.policy for this run.'),
  static: z.boolean().optional().describe('Also scan config.yaml source.path for framework attributes.'),
  maxPages: z.number().int().positive().optional().describe('Caps how many pages the crawl visits.'),
  verify: z
    .boolean()
    .optional()
    .describe('Re-checks the stored registry live instead of building a new one; does not crawl.'),
});

const DegradedSelectorSchema = z.object({
  elementId: z.string(),
  previousScore: z.number(),
  currentScore: z.number(),
});

const OutputSchema = z.object({
  mode: z.enum(['explore', 'verify']),
  registryPath: z.string(),
  elementCount: z.number(),
  added: z.number(),
  removed: z.number(),
  degraded: z.array(DegradedSelectorSchema),
  missingLocatorCount: z.number(),
  blockedRequestCount: z.number(),
});

/**
 * `qa.explore` (P2-05): the same `runExplore` core call `qa explore` uses for crawling, static
 * source analysis and `--verify` (development plan section 6.3). Manual pick-mode capture stays a
 * CLI-only feature (`qa explore --pick <url>`): it opens a headed browser for a human to click
 * through, which an agent cannot drive over MCP's stdio transport (AGENTS.md 12.4).
 */
export const exploreTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.explore',
  description:
    'Builds the selector registry by crawling the configured environment in safe mode, merging ' +
    'in static source analysis when "static" is set. Set "verify" to instead re-check every ' +
    'stored, non-deprecated selector against the live page and report which ones degraded. Does ' +
    'not support manual pick-mode capture — that is a CLI-only, human-driven feature.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const report = await runExplore(createNodeEngineContext(), {
      ...(input.environment !== undefined ? { environment: input.environment } : {}),
      ...(input.identity !== undefined ? { identity: input.identity } : {}),
      ...(input.cdpEndpointUrl !== undefined ? { cdpEndpointUrl: input.cdpEndpointUrl } : {}),
      ...(input.policy !== undefined ? { policy: input.policy } : {}),
      ...(input.static !== undefined ? { static: input.static } : {}),
      ...(input.maxPages !== undefined ? { maxPages: input.maxPages } : {}),
      ...(input.verify !== undefined ? { verify: input.verify } : {}),
    });
    return { ...report, degraded: [...report.degraded] };
  },
};
