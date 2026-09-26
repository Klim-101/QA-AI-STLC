// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runLink } from '@qa-ai-stlc/core';
import { FeatureIdSchema, TestTypeSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  specFile: z.string().describe('Project-relative path to the hand-written spec file.'),
  requirementId: z.string().describe('Id of a requirement already registered in artifacts/scope.json.'),
  feature: FeatureIdSchema.describe('Kebab-case feature name; the case is written under this folder.'),
  testType: TestTypeSchema.optional().describe('The spec\'s test type. Defaults to "e2e".'),
});

const OutputSchema = z.object({
  testCaseId: z.string(),
  casePath: z.string(),
  requirementId: z.string(),
  annotationFound: z.boolean(),
});

/**
 * `qa.link` (P3-11, development plan section 9 "Existing tests"): the same `runLink` core call
 * `qa link` uses — folds an already-existing, hand-written Playwright spec into the requirement →
 * case → result → evidence traceability matrix without running it through generation. Reuses the
 * spec's own `testCaseId` annotation when present; otherwise mints one and reports
 * `annotationFound: false` so the caller knows to add that annotation before a future `qa.run` can
 * attribute a result to this case.
 */
export const linkTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.link',
  description:
    'Registers an already-existing, hand-written spec file in the traceability matrix, linking it ' +
    'to a requirement id already in artifacts/scope.json. Reuses the spec\'s own "testCaseId" ' +
    'annotation when present; otherwise mints a fresh id and returns annotationFound: false, meaning ' +
    'the spec still needs that annotation added before qa.run can attribute a result to this case.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const result = await runLink(createNodeEngineContext(), {
      specFile: input.specFile,
      requirementId: input.requirementId,
      feature: input.feature,
      ...(input.testType !== undefined ? { testType: input.testType } : {}),
    });
    return {
      testCaseId: result.testCaseId,
      casePath: result.casePath,
      requirementId: result.requirementId,
      annotationFound: result.annotationFound,
    };
  },
};
