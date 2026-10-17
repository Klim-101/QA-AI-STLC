// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runTriageAdd } from '@qa-ai-stlc/core';
import { TriageSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  triage: TriageSchema.optional().describe(
    'The triage itself (TriageSchema). Prefer this: it needs no file in the project.',
  ),
  path: z
    .string()
    .optional()
    .describe('Project-relative path to a triage already written as JSON (TriageSchema).'),
});

const OutputSchema = z.object({
  runId: z.string(),
  triagePath: z.string(),
  entryCount: z.number().int(),
});

/**
 * `qa.triage_add` (P4-05): the same `runTriageAdd` core call `qa triage add` uses. Registers the
 * classification of a run's failures under `artifacts/triage/<run-id>.json`.
 */
export const triageAddTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.triage_add',
  description:
    'Validates the classification of a run\'s failed results, given inline as "triage" or as the JSON ' +
    'file at "path" (exactly one), and registers it under artifacts/triage/<run-id>.json. Every failed ' +
    'result of the run needs exactly one entry (category product-bug, flaky, stale-selector, ' +
    'environment or uncertain; use uncertain when the evidence cannot place it), each with a ' +
    'confidence and its reasons. The engine refuses an entry for a result that did not fail ' +
    "(TRIAGE_RESULT_NOT_FAILED), a case that is not the result's (TRIAGE_CASE_MISMATCH), evidence " +
    "that is not the result's (TRIAGE_EVIDENCE_NOT_OF_RESULT), a result classified twice " +
    '(TRIAGE_DUPLICATE_RESULT), a failure left out (TRIAGE_FAILURES_UNCLASSIFIED) and flaky for a ' +
    'case whose history is not flaky (TRIAGE_FLAKY_WITHOUT_HISTORY). Registering again for the same ' +
    'run replaces the earlier triage.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runTriageAdd(createNodeEngineContext(), {
      ...(input.path === undefined ? {} : { path: input.path }),
      ...(input.triage === undefined ? {} : { triage: input.triage }),
    }),
};
