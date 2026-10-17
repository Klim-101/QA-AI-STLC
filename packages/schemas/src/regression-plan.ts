// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, RelativePathSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';
import { RegressionTierSchema, TestTypeSchema } from './test-case.js';

// Why a case is not in the pack. Every excluded case carries one: a case that silently drops out of
// a regression run is a gap nobody sees.
export const RegressionExclusionReasonSchema = z.enum([
  'not-approved',
  'no-tier',
  'tier-above-threshold',
  'flaky',
]);
export type RegressionExclusionReason = z.infer<typeof RegressionExclusionReasonSchema>;

// How an included case is to be run. `spec`: a verified generated spec exists and nothing has
// changed under it. `live`: it has to be executed by `qa-execute`, and the reason says why there is
// no spec to run.
export const RegressionRouteSchema = z.enum(['spec', 'live']);
export type RegressionRoute = z.infer<typeof RegressionRouteSchema>;

export const RegressionRouteReasonSchema = z.enum([
  'verified-spec',
  'no-verified-spec',
  'stale-spec',
  'spec-changed',
]);
export type RegressionRouteReason = z.infer<typeof RegressionRouteReasonSchema>;

export const RegressionIncludedCaseSchema = z.object({
  testCaseId: IdentifierSchema,
  title: z.string().min(1),
  tier: RegressionTierSchema,
  testType: TestTypeSchema,
  route: RegressionRouteSchema,
  routeReason: RegressionRouteReasonSchema,
  // The spec to run, for the `spec` route.
  specPath: RelativePathSchema.optional(),
});
export type RegressionIncludedCase = z.infer<typeof RegressionIncludedCaseSchema>;

export const RegressionExcludedCaseSchema = z.object({
  testCaseId: IdentifierSchema,
  title: z.string().min(1),
  reason: RegressionExclusionReasonSchema,
  tier: RegressionTierSchema.optional(),
});
export type RegressionExcludedCase = z.infer<typeof RegressionExcludedCaseSchema>;

/** The spec files of one test type that `qa.run` takes in a single call. */
export const RegressionSpecRunSchema = z.object({
  testType: TestTypeSchema,
  specFiles: z.array(RelativePathSchema).min(1),
});
export type RegressionSpecRun = z.infer<typeof RegressionSpecRunSchema>;

/**
 * The regression pack for a tier threshold (P4-09), selected by the engine from the registered
 * cases and nothing else: which approved cases are in (their tier is at or below `maxTier`, in the
 * order smoke, critical-path, regression, extended, and the recorded history does not call them
 * flaky), how each is to be run, and every case that is out with its reason.
 */
export const RegressionPlanSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  maxTier: RegressionTierSchema,
  included: z.array(RegressionIncludedCaseSchema),
  excluded: z.array(RegressionExcludedCaseSchema),
  // The `spec` route, grouped the way `qa.run` takes it: one call per test type.
  specRuns: z.array(RegressionSpecRunSchema),
});
export type RegressionPlan = z.infer<typeof RegressionPlanSchema>;
