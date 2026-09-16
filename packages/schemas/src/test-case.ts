// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema } from './primitives.js';
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

export const TestCaseSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  id: IdentifierSchema,
  requirementIds: z.array(IdentifierSchema),
  testType: TestTypeSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(TestCaseStepSchema).min(1),
  expectedResult: z.string().min(1),
  status: TestCaseStatusSchema,
  createdAt: IsoDateTimeSchema,
});
export type TestCase = z.infer<typeof TestCaseSchema>;
