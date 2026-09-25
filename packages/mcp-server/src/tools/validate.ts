// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runValidate } from '@qa-ai-stlc/core';
import { PhaseNameSchema, PipelineStateSchema } from '@qa-ai-stlc/schemas';
import { z } from 'zod';
import { createNodeEngineContext } from '../engine-context.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = z.object({
  checkRuns: z
    .boolean()
    .optional()
    .describe(
      'Also sweep every recorded run result for a fabricated evidence link or a failed result ' +
        'missing evidence. Opt-in: reads every evidence directory the project has ever written to.',
    ),
});

const UnlinkedCaseSchema = z.object({
  casePath: z.string(),
  id: z.string(),
  unlinkedRequirementIds: z.array(z.string()),
});

const UnresolvedResultEvidenceSchema = z.object({
  resultPath: z.string(),
  id: z.string(),
  unresolvedEvidenceIds: z.array(z.string()),
});

const UncoveredFailedResultSchema = z.object({
  resultPath: z.string(),
  id: z.string(),
});

const OutputSchema = z.object({
  state: PipelineStateSchema,
  reopened: z.array(PhaseNameSchema),
  unlinkedCases: z.array(UnlinkedCaseSchema),
  tamperedArtifacts: z.array(z.string()),
  unresolvedResultEvidence: z.array(UnresolvedResultEvidenceSchema).optional(),
  resultsMissingEvidence: z.array(UncoveredFailedResultSchema).optional(),
});

/**
 * `qa.validate` (P2-05, ADR-003; P2-03 traceability; P2-07 `.qa/` integrity; P3-09 run evidence):
 * the same `runValidate` core call `qa validate` uses — recomputes every gate's status against
 * the approval ledger and the current artifact content, re-checks every registered test case's
 * requirement links against the current scope artifact, and re-hashes every artifact the
 * manifest has ever registered. `checkRuns: true` also sweeps every recorded run result for a
 * fabricated evidence link or a failed result with no registered evidence. A non-empty
 * `reopened`, `unlinkedCases`, `tamperedArtifacts`, `unresolvedResultEvidence` or
 * `resultsMissingEvidence` means the pipeline needs attention, not a phase simply never approved
 * yet.
 */
export const validateTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: 'qa.validate',
  description:
    "Recomputes every pipeline gate's status, re-checks every registered test case's " +
    'requirement links against the current scope artifact, and re-hashes every manifest-' +
    'registered artifact. Call after editing an approved artifact or a test case to see ' +
    'whether a gate reopened, a link broke, or a file was changed outside the engine. Pass ' +
    'checkRuns: true to also sweep every recorded run result for a fabricated evidence link or ' +
    'a failed result missing evidence.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  async handler(input) {
    const report = await runValidate(createNodeEngineContext(), { checkRuns: input.checkRuns === true });
    return {
      state: report.state,
      reopened: [...report.reopened],
      unlinkedCases: report.unlinkedCases.map((unlinkedCase) => ({
        casePath: unlinkedCase.casePath,
        id: unlinkedCase.id,
        unlinkedRequirementIds: [...unlinkedCase.unlinkedRequirementIds],
      })),
      tamperedArtifacts: [...report.tamperedArtifacts],
      ...(report.unresolvedResultEvidence !== undefined
        ? {
            unresolvedResultEvidence: report.unresolvedResultEvidence.map((issue) => ({
              resultPath: issue.resultPath,
              id: issue.id,
              unresolvedEvidenceIds: [...issue.unresolvedEvidenceIds],
            })),
          }
        : {}),
      ...(report.resultsMissingEvidence !== undefined
        ? { resultsMissingEvidence: [...report.resultsMissingEvidence] }
        : {}),
    };
  },
};
