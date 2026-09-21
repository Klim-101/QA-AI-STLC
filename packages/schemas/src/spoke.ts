// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// One issue from validating a spoke's response against its task-specific payload schema: the
// hub re-dispatches the spoke with these, so a spoke can act on exactly what was wrong instead of
// a flattened string (development plan section 5.1). `path` mirrors a Zod issue's own `path`,
// stringified so this schema stays independent of Zod's own issue shape.
export const SpokeValidationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string().min(1),
});
export type SpokeValidationIssue = z.infer<typeof SpokeValidationIssueSchema>;

// Carried on `status: 'error'`: either the spoke reported its own failure (a stable `code`, as
// `QaError` uses elsewhere) or the hub's validation of an `ok` response against the task's payload
// schema failed, in which case `issues` holds what to re-dispatch with (development plan section
// 5.1). A response can fail validation without the spoke itself ever raising an error, so `issues`
// is optional rather than folded into `message`.
export const SpokeErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  issues: z.array(SpokeValidationIssueSchema).optional(),
});
export type SpokeError = z.infer<typeof SpokeErrorSchema>;

// The generic envelope every spoke result flows through (development plan section 5.1, 5.3): the
// hub dispatches a spoke with a narrow task and gets back either a typed `payload` it still has to
// validate against that task's own payload schema, or a structured `error` it can use to
// re-dispatch. `spokeId` names the spoke definition that ran (for example `explorer-page`);
// `taskId` identifies this particular dispatch so retries and the future spoke I/O store
// (`.qa/runs/<run-id>/spokes/`, P4-01) can correlate attempts for the same task. Per-spoke-type
// payload shapes (explorer output, test-design output, and so on) are defined by the tasks that
// implement those spokes, not here.
export const SpokeResultSchema = z.discriminatedUnion('status', [
  z.object({
    schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
    spokeId: IdentifierSchema,
    taskId: IdentifierSchema,
    status: z.literal('ok'),
    payload: z.unknown(),
  }),
  z.object({
    schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
    spokeId: IdentifierSchema,
    taskId: IdentifierSchema,
    status: z.literal('error'),
    error: SpokeErrorSchema,
  }),
]);
export type SpokeResult = z.infer<typeof SpokeResultSchema>;
