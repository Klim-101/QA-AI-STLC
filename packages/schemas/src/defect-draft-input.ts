// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { SecurityConfidenceSchema } from './defect.js';
import { IdentifierSchema, RelativePathSchema } from './primitives.js';
import { SpokePathSegmentSchema } from './spoke.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// What the engine knows about one failure the triage called a product bug, laid out as the parts of
// a defect draft. The triage spoke writes the draft from it (a title, a severity, a category and the
// steps in its own words); it is not a draft yet. `actualResult` is the failure message, from the
// application under test: capped and between the untrusted-data markers (AGENTS.md 12.4).
export const DefectDraftSeedSchema = z.object({
  resultId: IdentifierSchema,
  testCaseId: IdentifierSchema,
  caseTitle: z.string().min(1),
  steps: z.array(z.string().min(1)),
  expectedResult: z.string().min(1),
  actualResult: z.string(),
  requirementIds: z.array(IdentifierSchema),
  // Where the run happened, when its run record says: the base URL and the identity it signed in as.
  environment: z.string().optional(),
  // The evidence the triage cited for this failure: the only evidence a draft from it may cite.
  evidencePaths: z.array(RelativePathSchema),
  triageConfidence: SecurityConfidenceSchema,
  triageReasons: z.array(z.string().min(1)),
});
export type DefectDraftSeed = z.infer<typeof DefectDraftSeedSchema>;

/** The failures of one run that its registered triage called product bugs, ready to be drafted. */
export const DefectDraftInputSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  runId: SpokePathSegmentSchema,
  seeds: z.array(DefectDraftSeedSchema),
});
export type DefectDraftInput = z.infer<typeof DefectDraftInputSchema>;
