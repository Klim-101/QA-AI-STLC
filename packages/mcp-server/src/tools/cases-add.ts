// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runCasesAdd } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  path: z.string().describe('Project-relative path to a test case written as JSON (TestCaseSchema).'),
});

const OutputSchema = z.object({
  casePath: z.string(),
  id: z.string(),
  requirementIds: z.array(z.string()),
});

/**
 * `qa.cases_add` (P2-05): the same `runCasesAdd` core call `qa cases add` uses — validates a test
 * case a human or an agent wrote as JSON (the engine never authors test-case content itself,
 * ADR-001), rejects it if any `requirementIds` entry does not resolve in `artifacts/scope.json`,
 * and only then registers it under `artifacts/cases/<feature>/<id>.json` (P2-20), using the case's
 * own `feature` field.
 */
export const casesAddTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.cases_add',
  description:
    'Validates a test case written as JSON at the given path and registers it under ' +
    'artifacts/cases/<feature>/<id>.json, using the case\'s own "feature" field. Fails with ' +
    'CASE_UNLINKED_REQUIREMENT if any requirementIds entry does not exist in artifacts/scope.json ' +
    '— run qa.scope first to register it.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const result = await runCasesAdd(createNodeEngineContext(), { path: input.path });
    return { casePath: result.casePath, id: result.id, requirementIds: [...result.requirementIds] };
  },
};
