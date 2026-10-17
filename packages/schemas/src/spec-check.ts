// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema } from './primitives.js';
import { RunResultStatusSchema } from './run-result.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// What one test of a checked spec did. Nothing of it is stored: it exists in this answer only.
export const SpecCheckResultSchema = z.object({
  testCaseId: IdentifierSchema,
  status: RunResultStatusSchema,
  // The runner's failure message, capped and inside the untrusted-data markers: it came from the
  // application under test (AGENTS.md 12.4).
  failureMessage: z.string().optional(),
  missingStepIds: z.array(z.string().min(1)).optional(),
});
export type SpecCheckResult = z.infer<typeof SpecCheckResultSchema>;

/**
 * The answer of running a spec set without recording it (P4-18). A check is not a run: it adds
 * nothing to `.qa/runs/`, `.qa/evidence/` or the manifest, so it changes neither `qa report` nor
 * the history that flaky detection and triage read.
 */
export const SpecCheckSummarySchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  counts: z.record(RunResultStatusSchema, z.number().int().nonnegative()),
  results: z.array(SpecCheckResultSchema),
});
export type SpecCheckSummary = z.infer<typeof SpecCheckSummarySchema>;
