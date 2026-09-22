// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { FeatureIdSchema, IdentifierSchema, IsoDateTimeSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// Matches the testing scope's four decidable types (development plan section 2.7); security has
// no test cases of its own because the on-demand audit runs outside this pipeline.
export const TestTypeSchema = z.enum(['e2e', 'api', 'a11y']);
export type TestType = z.infer<typeof TestTypeSchema>;

export const TestCaseStepSchema = z.object({
  description: z.string().min(1),
});
export type TestCaseStep = z.infer<typeof TestCaseStepSchema>;

export const TestCaseStatusSchema = z.enum(['draft', 'approved', 'rejected']);
export type TestCaseStatus = z.infer<typeof TestCaseStatusSchema>;

// ISO/IEC/IEEE 29119- and ISTQB-aligned regression tier (P2-17): one tier per case, not a
// multi-tag set, ordered from the narrowest run to the widest. `qa-regression` (P4-09) selects
// cases by a tier threshold, so the declaration order here is load-bearing, not just documentation
// — `REGRESSION_TIERS`'s index is that ordering, mirroring how `PHASES` (packages/core) keeps a
// pipeline order alongside its schema's enum.
export const REGRESSION_TIERS = ['smoke', 'critical-path', 'regression', 'extended'] as const;
export const RegressionTierSchema = z.enum(REGRESSION_TIERS);
export type RegressionTier = z.infer<typeof RegressionTierSchema>;

export const TestCaseSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  id: IdentifierSchema,
  // The tested feature this case belongs to (P2-20): an explicit, operator-chosen name, never
  // inferred from the title or a requirement id. `qa cases add` registers the case under
  // `artifacts/cases/<feature>/<id>.json`, so every case in a project must declare one.
  feature: FeatureIdSchema,
  // Traceability (development plan section 2.7 step 9, P2-03): every case links to at least one
  // requirement. `qa validate` separately checks that each id actually resolves in the scope
  // artifact — this only rules out a case with no link at all.
  requirementIds: z.array(IdentifierSchema).min(1),
  testType: TestTypeSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  // Optional (P2-17): a case written before `qa-design-cases` (P2-09) existed, or a hand-written
  // one, has neither. `qa-design-cases` sets both on every case it writes; nothing here forces an
  // older case to gain them retroactively.
  preconditions: z.array(z.string().min(1)).optional(),
  steps: z.array(TestCaseStepSchema).min(1),
  expectedResult: z.string().min(1),
  regressionTier: RegressionTierSchema.optional(),
  // Reusable test-data sets this case's steps/preconditions reference by id (P2-22), instead of
  // inlining values another case could share. Optional: a case with no data dependency has none.
  // `qa validate` rejects an id here that does not resolve to a registered `TestDataSchema` set.
  testDataRefs: z.array(IdentifierSchema).optional(),
  status: TestCaseStatusSchema,
  createdAt: IsoDateTimeSchema,
});
export type TestCase = z.infer<typeof TestCaseSchema>;
