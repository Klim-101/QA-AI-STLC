// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runTestDataAdd } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  path: z
    .string()
    .describe('Project-relative path to a reusable test-data set written as JSON (TestDataSchema).'),
});

const OutputSchema = z.object({
  testDataPath: z.string(),
  id: z.string(),
});

/**
 * `qa.test_data_add` (P2-22): the same `runTestDataAdd` core call `qa test-data add` uses —
 * validates a reusable test-data set a human or an agent wrote as JSON (the engine never authors
 * its content, the same boundary `qa.cases_add` already applies, ADR-001), and registers it under
 * artifacts/test-data/<feature>/<id>.json, using the set's own "feature" field.
 */
export const testDataAddTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.test_data_add',
  description:
    'Validates a reusable, non-secret test-data set written as JSON at the given path and ' +
    'registers it under artifacts/test-data/<feature>/<id>.json, using the set\'s own "feature" ' +
    'field. A test case references it by id in "testDataRefs"; qa.validate rejects a case whose ' +
    'testDataRefs entry does not resolve to a registered set.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const result = await runTestDataAdd(createNodeEngineContext(), { path: input.path });
    return { testDataPath: result.testDataPath, id: result.id };
  },
};
