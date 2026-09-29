// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { resolve } from 'node:path';
import { QaError, planProjectInit, runInit } from '@qa-ai-stlc/core';
import { TestingScopeDecisionSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

// Every type is required (no default, not optional): the operator answers each one, or defers it
// explicitly with "undecided". A missing key is a validation error, never a silent default.
const InputSchema = z.object({
  testing: z
    .object({
      e2e: TestingScopeDecisionSchema,
      api: TestingScopeDecisionSchema,
      a11y: TestingScopeDecisionSchema,
      security: TestingScopeDecisionSchema,
    })
    .describe(
      'The operator answer per testing type: "in-scope", "out-of-scope", or "undecided" to defer it.',
    ),
  confirmedRoot: z
    .string()
    .optional()
    .describe(
      'The absolute projectRoot the operator confirmed. Omit it to preview: nothing is written and the root that would be used is returned.',
    ),
  sourcePath: z.string().optional().describe('A local checkout of the application under test.'),
  apiSource: z
    .string()
    .optional()
    .describe(
      'The OpenAPI source: a file, a URL, "discover" or "synthesize". Required when api is in-scope.',
    ),
});

const OutputSchema = z.object({
  projectRoot: z.string().describe('The absolute directory .qa/ is (or would be) created in.'),
  initialized: z.boolean().describe('False for a preview: nothing was written.'),
  created: z.array(z.string()).describe('Files written under .qa/, relative to it.'),
});

/**
 * `qa.init` (P6-48): creates `.qa/` with the operator's testing-scope answers. Two calls: the first
 * (no `confirmedRoot`) only reports the root so the operator sees where it will write; the second
 * repeats the call with `confirmedRoot` set to that root. Refuses when `.qa/` already exists in the
 * directory or any parent, and never overwrites an existing config.
 */
export const initTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.init',
  description:
    'Creates the .qa/ store for a new project with the operator testing-scope answers. Ask the ' +
    'operator about Web E2E, API, accessibility and security testing one by one and pass each ' +
    'answer ("in-scope", "out-of-scope", or "undecided" to defer); never fill an answer in ' +
    'yourself. Call once without confirmedRoot to get the absolute projectRoot, show it to the ' +
    'operator, then call again with confirmedRoot set to it. Refuses when .qa/ already exists in ' +
    'that directory or any parent, and never overwrites an existing config.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const context = createNodeEngineContext();
    const target = await planProjectInit(context);
    if (input.confirmedRoot === undefined) {
      return { projectRoot: target.projectRoot, initialized: false, created: [] };
    }
    if (resolve(input.confirmedRoot) !== target.projectRoot) {
      throw new QaError(
        'INIT_ROOT_MISMATCH',
        `confirmedRoot ${input.confirmedRoot} is not the project root ${target.projectRoot}`,
        {
          remediation:
            'Call qa.init without confirmedRoot, show the operator the returned projectRoot and repeat with it.',
        },
      );
    }
    const result = await runInit(context, {
      deferScope: true,
      testing: input.testing,
      ...(input.sourcePath !== undefined ? { sourcePath: input.sourcePath } : {}),
      ...(input.apiSource !== undefined ? { apiSource: input.apiSource } : {}),
    });
    return { projectRoot: target.projectRoot, initialized: true, created: [...result.created] };
  },
};
