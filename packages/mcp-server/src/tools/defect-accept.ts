// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runDefectAccept } from '@qa-ai-stlc/core';
import { DefectStatusSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  id: z.string().describe('Id of a registered defect draft.'),
  approvedBy: z.string().describe('Who accepted the defect (an operator name).'),
  note: z.string().optional(),
});

const OutputSchema = z.object({
  id: z.string(),
  status: DefectStatusSchema,
  wasAlreadyAccepted: z.boolean(),
});

/**
 * `qa.defect_accept` (P6-07, ADR-003): the defect-acceptance gate. Marks the draft `accepted` and
 * records an approval bound to the hash of that exact content; editing the draft afterwards makes
 * it read as `draft` again.
 */
export const defectAcceptTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.defect_accept',
  description:
    'Accepts a registered defect draft after the operator reviewed it, hash-binding the approval to ' +
    "the draft's exact content. Only an accepted defect can go on to root cause analysis. Fails with " +
    'DEFECT_NOT_FOUND for an unregistered id and DEFECT_REJECTED for a rejected draft. Accepting is ' +
    'a decision for the operator: call it only on their instruction.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runDefectAccept(createNodeEngineContext(), {
      id: input.id,
      approvedBy: input.approvedBy,
      ...(input.note !== undefined ? { note: input.note } : {}),
    }),
};
