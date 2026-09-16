// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema } from './primitives.js';
import { SecurityConfidenceSchema } from './defect.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

export const RcaHypothesisSchema = z.object({
  description: z.string().min(1),
  confidence: SecurityConfidenceSchema,
  evidenceNeeded: z.string().optional(),
});
export type RcaHypothesis = z.infer<typeof RcaHypothesisSchema>;

export const RcaStatusSchema = z.enum(['draft', 'approved', 'rejected']);
export type RcaStatus = z.infer<typeof RcaStatusSchema>;

// An RCA exists only for a defect in state `accepted` and separates confirmed facts from
// hypotheses (development plan section 2.4). Only an `approved` RCA attaches to the report and
// the release recommendation.
export const RcaSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  defectId: IdentifierSchema,
  facts: z.array(z.string().min(1)),
  hypotheses: z.array(RcaHypothesisSchema).min(1),
  remediation: z.array(z.string().min(1)),
  regressionRecommendation: z.string().optional(),
  status: RcaStatusSchema,
  createdAt: IsoDateTimeSchema,
});
export type Rca = z.infer<typeof RcaSchema>;
