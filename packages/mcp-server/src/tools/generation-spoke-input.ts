// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBuildGenerationSpokeInput } from '@qa-ai-stlc/core';
import { GenerationSpokeInputSchema, IdentifierSchema, ProvenSessionSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  testCaseId: z.string().describe('The id of the registered test case to generate a spec for.'),
  elementIds: z
    .array(IdentifierSchema)
    .default([])
    .describe(
      "Registry element ids an e2e case's steps actually need — fails loudly on one that does not resolve. Omit for an api case.",
    ),
  environment: z
    .string()
    .optional()
    .describe(
      'Environment whose contract an api case is generated from. Required when there is more than one.',
    ),
  provenSession: ProvenSessionSchema.optional().describe(
    "The case's proven qa-execute session, from qa.generation_proven_session, when one exists.",
  ),
});

/**
 * `qa.generation_spoke_input` (P3-07): assembles the exact input a `generate-test-spec` spoke task
 * receives — the registered case, a registry slice narrowed to `elementIds`, and the real, currently
 * generated locator module's own `GENERATOR_VERSION` stamp (never assumed, always read back from
 * `tests/qa/locators.ts`). Call `qa.generation_proven_session` first and pass its `session` here as
 * `provenSession` so it becomes part of the returned input's `sourceHash`.
 */
export const generationSpokeInputTool: ToolDefinition<typeof InputSchema, typeof GenerationSpokeInputSchema> =
  {
    name: 'qa.generation_spoke_input',
    description:
      "Assembles a generate-test-spec spoke task's input: the registered case, a registry slice " +
      'narrowed to "elementIds", and the locator module\'s real GENERATOR_VERSION stamp. Pass a ' +
      'proven qa-execute session (qa.generation_proven_session) as "provenSession" when one exists. ' +
      'For an api case, "elementIds" is ignored and the input carries the contract operations the case ' +
      'names (apiContract, with the contract sha256) instead of a registry slice.',
    inputSchema: InputSchema,
    outputSchema: GenerationSpokeInputSchema,
    handler: (input) =>
      runBuildGenerationSpokeInput(createNodeEngineContext(), {
        testCaseId: input.testCaseId,
        elementIds: input.elementIds,
        ...(input.environment !== undefined ? { environment: input.environment } : {}),
        ...(input.provenSession !== undefined ? { provenSession: input.provenSession } : {}),
      }),
  };
