// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { applyManualRegions } from '@qa-ai-stlc/core';
import { ManualRegionSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  templateSource: z
    .string()
    .describe('The freshly generated spec source, before any manual region is spliced back in.'),
  existingRegions: z
    .array(ManualRegionSchema)
    .describe('The regions qa.generation_manual_regions_extract read from the file being replaced.'),
});

const OutputSchema = z.object({
  content: z.string(),
});

/**
 * `qa.generation_manual_regions_apply` (P3-05/P3-07): splices previously preserved
 * `// qa:manual` regions into a freshly generated template, replacing each marker pair's
 * placeholder content with the matching region `qa.generation_manual_regions_extract` read from the
 * file about to be overwritten. Fails loudly (`core.manual_regions.dropped`) when the new template
 * no longer has a marker a preserved region needs — a real loss of hand-written code, not silently
 * dropped.
 */
export const generationManualRegionsApplyTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.generation_manual_regions_apply',
  description:
    'Splices previously preserved "// qa:manual" regions into a freshly generated spec template, ' +
    "replacing each marker pair's placeholder content with the matching preserved region. Fails " +
    'when the new template dropped a marker a preserved region still needs.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  // `async`, not a plain arrow returning `Promise.resolve(...)`: `applyManualRegions` throws
  // synchronously on a dropped marker, and only an `async` function turns that into a rejected
  // promise instead of a synchronous throw out of `handler` itself (AGENTS.md 12.3: tool errors are
  // always a rejected promise, never a throw the caller must catch synchronously).
  // eslint-disable-next-line @typescript-eslint/require-await -- async on purpose, no await needed; see comment above.
  handler: async (input) => ({ content: applyManualRegions(input.templateSource, input.existingRegions) }),
};
