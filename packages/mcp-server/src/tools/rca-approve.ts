// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runRcaApprove } from '@qa-ai-stlc/core';
import { RcaStatusSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  defectId: z.string().describe('Id of the defect whose registered RCA is being approved.'),
  approvedBy: z.string().describe('Who reviewed the analysis (an operator name).'),
  note: z.string().optional(),
});

const OutputSchema = z.object({
  defectId: z.string(),
  status: RcaStatusSchema,
  wasAlreadyApproved: z.boolean(),
});

/**
 * `qa.rca_approve` (P6-14, ADR-003): the RCA review gate. Approves the registered RCA, binding the
 * approval to its exact content; it stops counting if the defect it explains changes.
 */
export const rcaApproveTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.rca_approve',
  description:
    'Approves a registered root cause analysis after the operator reviewed it, hash-binding the ' +
    'approval to its exact content and to the accepted defect it was written against. Only an ' +
    'approved RCA attaches to the report. Fails with RCA_NOT_FOUND, RCA_REJECTED, ' +
    'RCA_DEFECT_NOT_ACCEPTED or RCA_DEFECT_CHANGED. Approving is a decision for the operator: call ' +
    'it only on their instruction.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runRcaApprove(createNodeEngineContext(), {
      defectId: input.defectId,
      approvedBy: input.approvedBy,
      ...(input.note !== undefined ? { note: input.note } : {}),
    }),
};
