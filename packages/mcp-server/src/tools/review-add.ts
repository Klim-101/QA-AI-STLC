// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runReviewAdd } from '@qa-ai-stlc/core';
import { ReviewSchema, ReviewVerdictSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  review: ReviewSchema.optional().describe(
    'The review itself (ReviewSchema). Prefer this: it needs no file in the project.',
  ),
  path: z
    .string()
    .optional()
    .describe('Project-relative path to a review already written as JSON (ReviewSchema).'),
});

const OutputSchema = z.object({
  testCaseId: z.string(),
  verdict: ReviewVerdictSchema,
  reviewPath: z.string(),
});

/**
 * `qa.review_add` (P4-06): the same `runReviewAdd` core call `qa review add` uses. Registers the
 * verdict on a generated spec under `artifacts/reviews/<case-id>.json`.
 */
export const reviewAddTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.review_add',
  description:
    'Validates the verdict on a generated spec, given inline as "review" or as the JSON file at "path" ' +
    "(exactly one), and registers it under artifacts/reviews/<case-id>.json, bound to the spec's exact " +
    'content (quote specSha256 from qa.review_input). The engine refuses an approval that contradicts ' +
    'what it found: with an error finding (REVIEW_APPROVAL_BLOCKED, reject instead), with a warning ' +
    'that has no waiver and reason (REVIEW_WARNING_NOT_WAIVED), or a waiver for a finding it does not ' +
    'raise (REVIEW_WAIVER_UNKNOWN). Registering again for the same case replaces the earlier review.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runReviewAdd(createNodeEngineContext(), {
      ...(input.path === undefined ? {} : { path: input.path }),
      ...(input.review === undefined ? {} : { review: input.review }),
    }),
};
