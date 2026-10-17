// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runSpecCheck } from '@qa-ai-stlc/core';
import { SpecCheckSummarySchema, TestTypeSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';
import { RUNNERS_BY_TEST_TYPE } from './run.js';

const InputSchema = z.object({
  specFiles: z.array(z.string()).min(1).describe('Project-relative paths to the spec files to check.'),
  testType: TestTypeSchema.optional().describe('The spec set\'s test type. Defaults to "e2e".'),
  environment: z
    .string()
    .optional()
    .describe('Environment name from config.yaml. Required when there is more than one.'),
  identity: z.string().optional().describe('Identity name from config.yaml to sign in as.'),
});

/**
 * `qa.spec_check` (P4-18): the same runner `qa.run` uses, with nothing recorded.
 */
export const specCheckTool: ToolDefinition<typeof InputSchema, typeof SpecCheckSummarySchema> = {
  name: 'qa.spec_check',
  description:
    'Runs a spec set through the runner for its test type and returns what each test did (status, a ' +
    'capped failure message between UNTRUSTED EVIDENCE markers, missing steps) without recording ' +
    'anything: no run record, result file, evidence or manifest entry, so it changes neither ' +
    'qa.report nor the history flaky detection and triage read. Use it to ask whether a spec still ' +
    'passes when that is not itself a result to keep, for example in a review. Use qa.run for a run ' +
    'that counts.',
  inputSchema: InputSchema,
  outputSchema: SpecCheckSummarySchema,
  handler: (input) =>
    runSpecCheck(createNodeEngineContext(), {
      runner: RUNNERS_BY_TEST_TYPE[input.testType ?? 'e2e'],
      specFiles: input.specFiles,
      ...(input.environment === undefined ? {} : { environment: input.environment }),
      ...(input.identity === undefined ? {} : { identity: input.identity }),
    }),
};
