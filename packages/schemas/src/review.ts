// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema, RelativePathSchema, Sha256HexSchema } from './primitives.js';
import { SpokePathSegmentSchema } from './spoke.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// What the engine can tell about one assertion of a generated spec by reading it. An `error` makes
// the assertion something no approval can stand on; a `warning` is a doubt the reviewer has to
// settle in words.
export const ReviewFindingCodeSchema = z.enum([
  'tautology',
  'inline-locator',
  'unknown-locator',
  'ungrounded-value',
]);
export type ReviewFindingCode = z.infer<typeof ReviewFindingCodeSchema>;

export const ReviewFindingSeveritySchema = z.enum(['error', 'warning']);
export type ReviewFindingSeverity = z.infer<typeof ReviewFindingSeveritySchema>;

export const ReviewFindingSchema = z.object({
  code: ReviewFindingCodeSchema,
  severity: ReviewFindingSeveritySchema,
  message: z.string().min(1),
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

export const ReviewAssertionSubjectSchema = z.object({
  kind: z.enum(['locator', 'page', 'inline-locator', 'literal', 'other']),
  // The locator function, for `locator`.
  name: z.string().optional(),
});
export type ReviewAssertionSubject = z.infer<typeof ReviewAssertionSubjectSchema>;

// One `expect(...)` of the spec, in source order. `id` is its position (`a1`, `a2`, ...), stable
// because a review is bound to the exact content of the spec.
export const ReviewAssertionSchema = z.object({
  id: z.string().regex(/^a\d+$/u),
  line: z.number().int().positive(),
  // The `test.step` it sits in (`step-<N>` or `expected-result`); absent outside one.
  stepId: z.string().optional(),
  subject: ReviewAssertionSubjectSchema,
  matcher: z.string().min(1),
  expectedValues: z.array(z.string()),
  findings: z.array(ReviewFindingSchema),
});
export type ReviewAssertion = z.infer<typeof ReviewAssertionSchema>;

export const ReviewInputCaseSchema = z.object({
  title: z.string().min(1),
  steps: z.array(z.string().min(1)),
  expectedResult: z.string().min(1),
});
export type ReviewInputCase = z.infer<typeof ReviewInputCaseSchema>;

/**
 * Everything the reviewer spoke gets about a generated spec, built by the engine from registered
 * artifacts: the case, the spec as registered, the engine's own verification of it and what the
 * engine found in each assertion. The author's reasoning is not among them, and cannot be: the
 * engine reads artifacts, never the author's spoke records.
 */
export const ReviewInputSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  testCaseId: IdentifierSchema,
  specPath: RelativePathSchema,
  specSha256: Sha256HexSchema,
  case: ReviewInputCaseSchema,
  specContent: z.string(),
  isSpecTruncated: z.boolean(),
  // The verification that authorized the spec's registration, when the engine holds one.
  verification: z
    .object({
      id: z.string(),
      status: z.string(),
      resultStatus: z.string().optional(),
    })
    .optional(),
  // False when no passing `qa-execute` session of the case exists to ground expected values in.
  hasProvenSession: z.boolean(),
  assertions: z.array(ReviewAssertionSchema),
});
export type ReviewInput = z.infer<typeof ReviewInputSchema>;

export const ReviewVerdictSchema = z.enum(['approved', 'rejected']);
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

// A warning the reviewer looked at and accepted, with the reason. It names the assertion and the
// finding it answers; a waiver for a finding the engine does not raise is refused.
export const ReviewWaiverSchema = z.object({
  assertionId: z.string().regex(/^a\d+$/u),
  code: ReviewFindingCodeSchema,
  reason: z.string().min(1),
});
export type ReviewWaiver = z.infer<typeof ReviewWaiverSchema>;

// The reviewer's verdict on one spec, bound to its exact content (`specSha256`): a spec changed
// afterwards is not the one that was reviewed. One current review per case.
export const ReviewSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  // Names the file the review is stored in, so it is a single safe path segment.
  testCaseId: SpokePathSegmentSchema,
  specPath: RelativePathSchema,
  specSha256: Sha256HexSchema,
  verdict: ReviewVerdictSchema,
  reasons: z.array(z.string().min(1)).min(1).describe('What the verdict rests on, one statement each.'),
  waivers: z.array(ReviewWaiverSchema).default([]),
  createdAt: IsoDateTimeSchema,
});
export type Review = z.infer<typeof ReviewSchema>;
