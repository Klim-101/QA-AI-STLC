// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runConfigSet } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  key: z
    .string()
    .describe(
      'The setting to change: testing.e2e, testing.api, testing.a11y, testing.security or ui.componentLibrary.',
    ),
  value: z
    .string()
    .describe(
      'For testing.*: "in-scope", "out-of-scope" or "undecided". For ui.componentLibrary: "none", "kendo-jquery" or "kendo-angular".',
    ),
});

const InputWithApiSchema = InputSchema.extend({
  apiSource: z
    .string()
    .optional()
    .describe(
      'Only with key testing.api: where the OpenAPI contract comes from (a project file, a URL, "discover" or "synthesize"). Required to turn API testing on in a project that has no api section yet.',
    ),
});

const OutputSchema = z.object({ key: z.string(), value: z.string() });

/**
 * `qa.config_set` (P6-48): the same `runConfigSet` core call `qa config set` uses — changes one
 * testing type's scope decision or the UI component library in the resolved project's committed `.qa/config.yaml` only.
 */
export const configSetTool: ToolDefinition<typeof InputWithApiSchema, typeof OutputSchema> = {
  name: 'qa.config_set',
  description:
    'Changes one testing type scope decision (testing.e2e, testing.api, testing.a11y or ' +
    'testing.security) to in-scope, out-of-scope or undecided, or sets ui.componentLibrary to ' +
    'none, kendo-jquery or kendo-angular, in the project .qa/config.yaml. ' +
    'Turning testing.api to in-scope in a project without an api section also needs apiSource ' +
    '(a file, a URL, "discover" or "synthesize"); switching it off later keeps that section. ' +
    'Use it only for an answer the operator gave. Reopening a decided scope invalidates ' +
    'approvals that depended on it the next time qa.approve or qa.validate runs.',
  inputSchema: InputWithApiSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runConfigSet(createNodeEngineContext(), {
      key: input.key,
      value: input.value,
      ...(input.apiSource === undefined ? {} : { apiSource: input.apiSource }),
    }),
};
