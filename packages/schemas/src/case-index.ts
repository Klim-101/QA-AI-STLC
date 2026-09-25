// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { FeatureIdSchema, IdentifierSchema, RelativePathSchema, Sha256HexSchema } from './primitives.js';
import { TestTypeSchema } from './test-case.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// One entry per case in a feature's index (#357): a steps-free summary of what the case is, its
// type and which requirement(s) it covers, so a reviewer or agent can see feature coverage without
// reading every case's full JSON.
export const CaseSummarySchema = z.object({
  id: IdentifierSchema,
  title: z.string().min(1),
  testType: TestTypeSchema,
  requirementIds: z.array(IdentifierSchema).min(1),
  description: z.string().optional(),
});
export type CaseSummary = z.infer<typeof CaseSummarySchema>;

export const FeatureCaseIndexSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  feature: FeatureIdSchema,
  cases: z.array(CaseSummarySchema),
});
export type FeatureCaseIndex = z.infer<typeof FeatureCaseIndexSchema>;

export const CaseFileHashSchema = z.object({
  path: RelativePathSchema,
  sha256: Sha256HexSchema,
});
export type CaseFileHash = z.infer<typeof CaseFileHashSchema>;

// The `cases` gate's canonical artifact (#357): the path and content hash of every registered case
// file, sorted by path. Approving this snapshot approves the whole case set at once, so editing or
// adding a single case file changes this aggregate's own hash and reopens the gate the same way
// editing `artifacts/scope.json` already reopens `scope` — a single-file `prefix` binding could
// never catch that, since any one case file's hash satisfied it regardless of the others.
export const CasesIndexSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  files: z.array(CaseFileHashSchema),
});
export type CasesIndex = z.infer<typeof CasesIndexSchema>;
