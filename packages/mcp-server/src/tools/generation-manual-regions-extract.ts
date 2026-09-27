// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { extractManualRegions } from '@qa-ai-stlc/core';
import { ManualRegionSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  source: z.string().describe('The existing generated spec\'s full source, about to be overwritten.'),
});

const OutputSchema = z.object({
  regions: z.array(ManualRegionSchema),
});

/**
 * `qa.generation_manual_regions_extract` (P3-05/P3-07): reads every
 * `// qa:manual:start <id>` / `// qa:manual:end <id>` block out of an existing generated spec's
 * source, in file order. Call before regenerating a spec that already has content, then pass the
 * result to `qa.generation_manual_regions_apply` so hand-written additions survive regeneration —
 * this splicing is deterministic engine logic, never left to the model's own judgment (AGENTS.md 12.1).
 */
export const generationManualRegionsExtractTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.generation_manual_regions_extract',
  description:
    'Reads every "// qa:manual:start <id>" / "// qa:manual:end <id>" block out of an existing ' +
    'generated spec\'s source, in file order, so it can be spliced back into a freshly regenerated ' +
    'template with qa.generation_manual_regions_apply.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  // `async`, not a plain arrow returning `Promise.resolve(...)`: `extractManualRegions` throws
  // synchronously on a malformed region, and only an `async` function turns that into a rejected
  // promise instead of a synchronous throw out of `handler` itself.
  // eslint-disable-next-line @typescript-eslint/require-await -- async on purpose, no await needed; see comment above.
  handler: async (input) => ({ regions: [...extractManualRegions(input.source)] }),
};
