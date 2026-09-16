// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema } from './primitives.js';
import { TestTypeSchema } from './test-case.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// `blocked`, `skipped`, `uncertain` and `partial` are honest statuses, never reported as `passed`
// or `failed` (AGENTS.md 12.5): a result the engine could not fully determine must say so.
export const RunResultStatusSchema = z.enum([
  'passed',
  'failed',
  'blocked',
  'skipped',
  'uncertain',
  'partial',
]);
export type RunResultStatus = z.infer<typeof RunResultStatusSchema>;

export const RunResultFailureSchema = z.object({
  message: z.string().min(1),
  stack: z.string().optional(),
});
export type RunResultFailure = z.infer<typeof RunResultFailureSchema>;

export const RunResultSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  id: IdentifierSchema,
  runId: IdentifierSchema,
  testCaseId: IdentifierSchema,
  testType: TestTypeSchema,
  status: RunResultStatusSchema,
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema,
  evidenceIds: z.array(IdentifierSchema),
  failure: RunResultFailureSchema.optional(),
});
export type RunResult = z.infer<typeof RunResultSchema>;
