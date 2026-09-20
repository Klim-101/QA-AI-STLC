// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runApprove } from '@qa-ai-stlc/core';
import { PhaseNameSchema, PipelineStateSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  gate: PhaseNameSchema.describe('The pipeline phase to approve.'),
  artifactPath: z.string().describe('Project-relative path to the artifact this approval covers.'),
  approvedBy: z.string().describe('Who or what approved the gate (an operator name or agent identity).'),
  note: z.string().optional(),
});

const OutputSchema = z.object({
  gate: PhaseNameSchema,
  state: PipelineStateSchema,
});

/**
 * `qa.approve` (P2-05, ADR-003): the same `runApprove` core call `qa approve` uses — hashes the
 * artifact's current content and records the approval, advancing the pipeline when `gate` is the
 * current phase. Throws GATE_OUT_OF_ORDER for a later phase approved before an earlier one is
 * satisfied, and GATE_ARTIFACT_MISSING when the artifact does not exist.
 */
export const approveTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.approve',
  description:
    'Approves a pipeline gate (currently "scope" or "cases"), hash-binding the approval to the ' +
    "artifact's exact current content (ADR-003). Editing the artifact afterwards reopens the " +
    'gate automatically; re-approve it to satisfy the gate again.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: (input) =>
    runApprove(createNodeEngineContext(), {
      gate: input.gate,
      artifactPath: input.artifactPath,
      approvedBy: input.approvedBy,
      ...(input.note !== undefined ? { note: input.note } : {}),
    }),
};
