// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runReviewInput } from '@qa-ai-stlc/core';
import { ReviewInputSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  testCaseId: z.string().describe('Id of the case the spec was generated for.'),
  specPath: z.string().describe('Project-relative path the spec was registered under.'),
});

/**
 * `qa.review_input` (P4-06): what the reviewer spoke works from, built by the engine from
 * registered artifacts only.
 */
export const reviewInputTool: ToolDefinition<typeof InputSchema, typeof ReviewInputSchema> = {
  name: 'qa.review_input',
  description:
    'Returns what a review of a generated spec is made from: the case, the spec as registered, the ' +
    'verification that let it be registered and, for each expect(...) of the spec, what the engine ' +
    'found: tautology (the assertion is about a literal), inline-locator (a selector written into the ' +
    'spec), unknown-locator (a function the locator module does not export) and ungrounded-value ' +
    "(an expected value neither the case nor its proven session contains). The author's reasoning is " +
    'not part of it. Fails with REVIEW_SPEC_NOT_REGISTERED for a spec the engine did not register or ' +
    'that changed since, and REVIEW_SPEC_CASE_MISMATCH for a spec of another case.',
  inputSchema: InputSchema,
  outputSchema: ReviewInputSchema,
  handler: (input) =>
    runReviewInput(createNodeEngineContext(), { testCaseId: input.testCaseId, specPath: input.specPath }),
};
