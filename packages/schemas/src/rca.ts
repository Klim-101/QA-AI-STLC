// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema, RelativePathSchema, Sha256HexSchema } from './primitives.js';
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
  // Evidence the facts rest on, registered by the engine; a fact with nothing here is the author's word.
  evidencePaths: z.array(RelativePathSchema).default([]),
  hypotheses: z.array(RcaHypothesisSchema).min(1),
  remediation: z.array(z.string().min(1)),
  regressionRecommendation: z.string().optional(),
  // SHA-256 of the accepted defect this analysis was written against, stamped by the engine when
  // the RCA is registered (never taken from the author): an approval stops counting once the
  // defect it analysed has changed.
  defectSha256: Sha256HexSchema.optional(),
  status: RcaStatusSchema,
  createdAt: IsoDateTimeSchema,
});
export type Rca = z.infer<typeof RcaSchema>;
