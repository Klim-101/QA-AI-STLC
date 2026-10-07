// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { DefectDraftSchema } from './defect.js';
import { IdentifierSchema, IsoDateTimeSchema, RelativePathSchema, Sha256HexSchema } from './primitives.js';
import { RunResultStatusSchema } from './run-result.js';
import { TestTypeSchema } from './test-case.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// Where the application's source lives, when the project configured one. The engine hands over the
// location only: reading the code is the agent host's own read-only file access, bounded to this
// directory (development plan section 2.4).
export const RcaInputSourceSchema = z.object({
  isConfigured: z.boolean(),
  path: RelativePathSchema.optional(),
});
export type RcaInputSource = z.infer<typeof RcaInputSourceSchema>;

// One piece of the defect's evidence. `excerpt` is only ever set for text evidence and is wrapped
// in the untrusted-data markers: it comes from the application under test and is data, never
// instructions (AGENTS.md 12.4).
export const RcaInputEvidenceSchema = z.object({
  path: RelativePathSchema,
  sha256: Sha256HexSchema,
  sizeBytes: z.number().int().nonnegative(),
  excerpt: z.string().optional(),
  isTruncated: z.boolean(),
});
export type RcaInputEvidence = z.infer<typeof RcaInputEvidenceSchema>;

export const RcaInputCaseSchema = z.object({
  id: IdentifierSchema,
  title: z.string().min(1),
  feature: z.string().min(1),
  testType: TestTypeSchema,
  requirementIds: z.array(IdentifierSchema),
});
export type RcaInputCase = z.infer<typeof RcaInputCaseSchema>;

// A run result of one of the cases above. `failureMessage` is untrusted for the same reason as an
// evidence excerpt and carries the same markers.
export const RcaInputResultSchema = z.object({
  resultId: IdentifierSchema,
  runId: IdentifierSchema,
  testCaseId: IdentifierSchema,
  status: RunResultStatusSchema,
  finishedAt: IsoDateTimeSchema,
  failureMessage: z.string().optional(),
});
export type RcaInputResult = z.infer<typeof RcaInputResultSchema>;

/**
 * Everything the `qa-rca` spoke gets, built by the engine from registered artifacts (never from the
 * agent's memory): the accepted defect and the hash of it the RCA will be bound to, the cases that
 * cover the defect's requirements, their run history, and the defect's evidence. The spoke returns
 * an `Rca` document as its `SpokeResult` payload.
 */
export const RcaInputSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  defect: DefectDraftSchema,
  defectSha256: Sha256HexSchema,
  cases: z.array(RcaInputCaseSchema),
  // Newest first, capped; `omittedResultCount` says how many older ones were left out.
  results: z.array(RcaInputResultSchema),
  omittedResultCount: z.number().int().nonnegative(),
  evidence: z.array(RcaInputEvidenceSchema),
  source: RcaInputSourceSchema,
});
export type RcaInput = z.infer<typeof RcaInputSchema>;
