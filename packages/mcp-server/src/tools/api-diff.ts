// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runApiDiff } from '@qa-ai-stlc/explorer';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  environment: z
    .string()
    .optional()
    .describe('Environment name from config.yaml. Required when there is more than one.'),
});

const OutputSchema = z.object({
  reportPath: z.string(),
  contractSource: z.string(),
  contractSha256: z.string(),
  counts: z.object({
    matched: z.number(),
    undocumented: z.number(),
    methodNotDocumented: z.number(),
    unobserved: z.number(),
  }),
});

/**
 * `qa.api_diff` (P6-02): the same `runApiDiff` core call `qa api-diff` uses. It reads the
 * contract named by `api.source` (a file, a URL on the allowlist, or "discover", which probes
 * known spec paths with GET requests only).
 */
export const apiDiffTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.api_diff',
  description:
    'Compares the configured OpenAPI 3.x contract with the endpoints the last "qa.explore" observed ' +
    'and writes the classified discrepancies (matched, undocumented, method not documented, ' +
    'unobserved) to "reportPath" (".qa/selectors/api-diff.json"), stamped with the contract hash. ' +
    'Requires "qa.explore" to have run and config.yaml api.source to be set. Read-only against the ' +
    'application: GET requests to the allowlisted host only.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    return runApiDiff(createNodeEngineContext(), {
      ...(input.environment !== undefined ? { environment: input.environment } : {}),
    });
  },
};
