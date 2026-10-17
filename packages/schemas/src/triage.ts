// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { SecurityConfidenceSchema } from './defect.js';
import { RcaInputEvidenceSchema } from './rca-input.js';
import { IdentifierSchema, IsoDateTimeSchema, RelativePathSchema } from './primitives.js';
import { RunResultStatusSchema } from './run-result.js';
import { TestTypeSchema } from './test-case.js';
import { SpokePathSegmentSchema } from './spoke.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// Why a result failed (development plan section 5.3). `uncertain` is an honest answer, never
// rounded to one of the others (AGENTS.md 12.5): a result the evidence cannot place stays unplaced.
export const TriageCategorySchema = z.enum([
  'product-bug',
  'flaky',
  'stale-selector',
  'environment',
  'uncertain',
]);
export type TriageCategory = z.infer<typeof TriageCategorySchema>;

// What the engine could read off a failure message without judging it. A hint for the spoke, not a
// classification: `locator-not-found` is what both a stale selector and a missing feature look like.
export const TriageFailureKindSchema = z.enum([
  'network',
  'locator-not-found',
  'assertion-mismatch',
  'other',
]);
export type TriageFailureKind = z.infer<typeof TriageFailureKindSchema>;

export const TriageEntrySchema = z.object({
  resultId: IdentifierSchema,
  testCaseId: IdentifierSchema,
  category: TriageCategorySchema,
  confidence: SecurityConfidenceSchema,
  reasons: z.array(z.string().min(1)).min(1).describe('What the category rests on, one statement each.'),
  // Evidence the engine registered for this result; a reason with nothing here is the author's word.
  evidencePaths: z.array(RelativePathSchema).default([]),
});
export type TriageEntry = z.infer<typeof TriageEntrySchema>;

// The classification of every failed result of one run (`artifacts/triage/<run-id>.json`). It is
// advice for the operator and the input of defect drafting, not a gate.
export const TriageSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  // Names the file the triage is stored in, so it is a single safe path segment.
  runId: SpokePathSegmentSchema,
  entries: z.array(TriageEntrySchema).min(1),
  createdAt: IsoDateTimeSchema,
});
export type Triage = z.infer<typeof TriageSchema>;

// One recorded outcome of a case, oldest first, as the flaky check reads them.
export const TriageHistoryEntrySchema = z.object({
  runId: IdentifierSchema,
  status: RunResultStatusSchema,
  finishedAt: IsoDateTimeSchema,
});
export type TriageHistoryEntry = z.infer<typeof TriageHistoryEntrySchema>;

// A failed result and what the engine knows about it. `failureMessage` and every evidence excerpt
// came from the application under test: capped and wrapped in the untrusted-data markers.
export const TriageInputFailureSchema = z.object({
  resultId: IdentifierSchema,
  testCaseId: IdentifierSchema,
  title: z.string().optional(),
  testType: TestTypeSchema,
  failureMessage: z.string(),
  failureKind: TriageFailureKindSchema,
  evidence: z.array(RcaInputEvidenceSchema),
  // The case's recorded results across runs, this one included, and whether the configured flaky
  // thresholds (`flaky.historyWindow`, `flaky.minStatusChanges`) call that history flaky.
  history: z.array(TriageHistoryEntrySchema),
  isFlaky: z.boolean(),
});
export type TriageInputFailure = z.infer<typeof TriageInputFailureSchema>;

/** Everything the triage spoke gets, built by the engine from registered artifacts. */
export const TriageInputSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  runId: SpokePathSegmentSchema,
  failures: z.array(TriageInputFailureSchema),
  // Failed results beyond what fits in `failures`; zero when all of them are listed.
  omittedFailureCount: z.number().int().nonnegative(),
});
export type TriageInput = z.infer<typeof TriageInputSchema>;
