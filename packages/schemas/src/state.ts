// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// v0 (development plan section 2.7, 8): scope → cases only. A later phase adds the remaining
// pipeline gates (generation, run, defect acceptance, RCA review) by extending this list, not by
// building a second mechanism.
export const PhaseNameSchema = z.enum(['scope', 'cases']);
export type PhaseName = z.infer<typeof PhaseNameSchema>;

export const GateStatusSchema = z.enum(['open', 'satisfied']);
export type GateStatus = z.infer<typeof GateStatusSchema>;

export const GateStateSchema = z.object({
  status: GateStatusSchema,
});
export type GateState = z.infer<typeof GateStateSchema>;

// `.qa/state.json`: a read-model `qa validate` recomputes from the approval ledger and the
// artifacts it references (ADR-003), not a status this or any other command trusts on its own —
// re-running validate after an approved artifact changes on disk recomputes `open` for that gate
// without a separate tamper check.
export const PipelineStateSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  currentPhase: PhaseNameSchema,
  gates: z.record(PhaseNameSchema, GateStateSchema),
});
export type PipelineState = z.infer<typeof PipelineStateSchema>;
