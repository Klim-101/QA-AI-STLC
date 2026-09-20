// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runValidate } from '@qa-ai-stlc/core';
import { PhaseNameSchema, PipelineStateSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({});

const UnlinkedCaseSchema = z.object({
  casePath: z.string(),
  id: z.string(),
  unlinkedRequirementIds: z.array(z.string()),
});

const OutputSchema = z.object({
  state: PipelineStateSchema,
  reopened: z.array(PhaseNameSchema),
  unlinkedCases: z.array(UnlinkedCaseSchema),
});

/**
 * `qa.validate` (P2-05, ADR-003; P2-03 traceability): the same `runValidate` core call `qa
 * validate` uses — recomputes every gate's status against the approval ledger and the current
 * artifact content, and re-checks every registered test case's requirement links against the
 * current scope artifact. A non-empty `reopened` or `unlinkedCases` means the pipeline needs
 * attention, not a phase simply never approved yet.
 */
export const validateTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.validate',
  description:
    "Recomputes every pipeline gate's status and re-checks every registered test case's " +
    'requirement links against the current scope artifact. Call after editing an approved ' +
    'artifact or a test case to see whether a gate reopened or a link broke.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler() {
    const report = await runValidate(createNodeEngineContext());
    return {
      state: report.state,
      reopened: [...report.reopened],
      unlinkedCases: report.unlinkedCases.map((unlinkedCase) => ({
        casePath: unlinkedCase.casePath,
        id: unlinkedCase.id,
        unlinkedRequirementIds: [...unlinkedCase.unlinkedRequirementIds],
      })),
    };
  },
};
