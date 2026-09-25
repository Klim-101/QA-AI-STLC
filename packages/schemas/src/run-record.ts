// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema, RelativePathSchema } from './primitives.js';
import { RunResultStatusSchema } from './run-result.js';
import { TestTypeSchema } from './test-case.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// One invocation of `qa run` / MCP `qa.run` (P3-04): a `Runner` executing a spec set and
// producing zero or more `RunResultSchema` values, distinct from a single interactive case-result
// registration (`RegisterCaseResultResult`, P3-14) which has no spec set or runner behind it.
export const RunRecordSchema = z
  .object({
    schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
    id: IdentifierSchema,
    testType: TestTypeSchema,
    specFiles: z.array(RelativePathSchema).min(1),
    baseUrl: z.string().min(1),
    startedAt: IsoDateTimeSchema,
    finishedAt: IsoDateTimeSchema,
    resultIds: z.array(IdentifierSchema),
    // Exhaustive over every `RunResultStatus` (mirrors `PipelineStateSchema.gates`'s enum-keyed
    // record) so a reader never has to guess whether a status with zero results was omitted or
    // just didn't occur.
    counts: z.record(RunResultStatusSchema, z.number().int().nonnegative()),
  })
  .refine((record) => new Date(record.finishedAt) >= new Date(record.startedAt), {
    message: '"finishedAt" must not be earlier than "startedAt"',
    path: ['finishedAt'],
  })
  .refine(
    (record) => record.resultIds.length === Object.values(record.counts).reduce((sum, n) => sum + n, 0),
    { message: '"counts" must sum to the number of "resultIds"', path: ['counts'] },
  );
export type RunRecord = z.infer<typeof RunRecordSchema>;
