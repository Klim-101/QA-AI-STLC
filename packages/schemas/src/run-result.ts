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

export const RunResultSchema = z
  .object({
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
    // The declared step/expected-result IDs (P3-02) a runner found no matching `test.step()` for
    // in its report, in declaration order. Only meaningful for `status: 'partial'`: it is how a
    // partial result says which part of the case it did not get to, not just that it did not
    // finish.
    missingStepIds: z.array(z.string().min(1)).optional(),
  })
  // Valid JSON is not a correct result: a result that finished before it started, or that claims
  // to have failed without saying what failed, is not a shape the engine ever produces.
  .refine((result) => new Date(result.finishedAt) >= new Date(result.startedAt), {
    message: '"finishedAt" must not be earlier than "startedAt"',
    path: ['finishedAt'],
  })
  .refine((result) => result.status !== 'failed' || result.failure !== undefined, {
    message: '"failure" is required when status is "failed"',
    path: ['failure'],
  })
  .refine((result) => result.status !== 'partial' || (result.missingStepIds?.length ?? 0) > 0, {
    message: '"missingStepIds" is required and non-empty when status is "partial"',
    path: ['missingStepIds'],
  })
  .refine((result) => result.status === 'partial' || result.missingStepIds === undefined, {
    message: '"missingStepIds" is only meaningful when status is "partial"',
    path: ['missingStepIds'],
  });
export type RunResult = z.infer<typeof RunResultSchema>;
