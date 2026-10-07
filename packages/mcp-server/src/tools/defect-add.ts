// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runDefectAdd } from '@qa-ai-stlc/core';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  path: z.string().describe('Project-relative path to a defect draft written as JSON (DefectDraftSchema).'),
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
    'Validates a tracker-neutral defect draft written as JSON at the given path and registers it ' +
    'under artifacts/defects/<id>.json with status "draft". Fails with DEFECT_UNLINKED_REQUIREMENT ' +
    'if a cited requirement is not in artifacts/scope.json, and DEFECT_EVIDENCE_UNREGISTERED if an ' +
    'evidence path was not registered by an engine tool. A draft cannot be filed already accepted; ' +
    'acceptance is a separate operator step (qa.defect_accept).',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const result = await runDefectAdd(createNodeEngineContext(), { path: input.path });
    return {
      id: result.id,
      defectPath: result.defectPath,
      requirementIds: [...result.requirementIds],
      evidencePaths: [...result.evidencePaths],
    };
  },
};
