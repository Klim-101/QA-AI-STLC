// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runDefectAdd } from '@qa-ai-stlc/core';
import { DefectDraftSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  draft: DefectDraftSchema.optional().describe(
    'The defect draft itself (DefectDraftSchema). Prefer this: it needs no file in the project.',
  ),
  path: z
    .string()
    .optional()
    .describe('Project-relative path to a defect draft already written as JSON (DefectDraftSchema).'),
});

const OutputSchema = z.object({
  id: z.string(),
  defectPath: z.string(),
  requirementIds: z.array(z.string()),
  evidencePaths: z.array(z.string()),
});

/**
 * `qa.defect_add` (P6-07): the same `runDefectAdd` core call `qa defect add` uses. Registers a
 * defect draft under `artifacts/defects/<id>.json`; the draft stays `draft` until an operator
 * accepts it.
 */
export const defectAddTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.defect_add',
  description:
    'Validates a tracker-neutral defect draft, given inline as "draft" or as the JSON file at "path" ' +
    '(exactly one), and registers it under artifacts/defects/<id>.json with status "draft". A draft ' +
    'that does not match its schema fails with DEFECT_INVALID, whose remediation names every invalid ' +
    'field and the values it allows. Fails with DEFECT_UNLINKED_REQUIREMENT ' +
    'if a cited requirement is not in artifacts/scope.json, and DEFECT_EVIDENCE_UNREGISTERED if an ' +
    'evidence path was not registered by an engine tool. A draft cannot be filed already accepted; ' +
    'acceptance is a separate operator step (qa.defect_accept).',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const result = await runDefectAdd(createNodeEngineContext(), {
      ...(input.path === undefined ? {} : { path: input.path }),
      ...(input.draft === undefined ? {} : { draft: input.draft }),
    });
    return {
      id: result.id,
      defectPath: result.defectPath,
      requirementIds: [...result.requirementIds],
      evidencePaths: [...result.evidencePaths],
    };
  },
};
