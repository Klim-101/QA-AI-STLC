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

// Names a spoke I/O record is stored under (`.qa/runs/<run-id>/spokes/<spoke>/<task>/...`, P4-01),
// so each is a single safe path segment on every OS: no separator, no `..`, a bounded length.
export const SpokePathSegmentSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u,
    'must be 1-64 letters, digits, ".", "_" or "-", starting with a letter or digit',
  );
export type SpokePathSegment = z.infer<typeof SpokePathSegmentSchema>;

// What the hub gave a spoke for one attempt at one task: the task and the minimal context, nothing
// else (development plan section 5.3). `attempt` counts from 1; a retry after a failed validation
// is a new attempt of the same task. Kept as evidence of context isolation and as eval material.
export const SpokeInputRecordSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  runId: SpokePathSegmentSchema,
  spokeId: SpokePathSegmentSchema,
  taskId: SpokePathSegmentSchema,
  attempt: z.number().int().positive(),
  task: z.string().min(1),
  // Absent when the hub gave the spoke no context: the stored record omits the key.
  context: z.unknown().optional(),
  recordedAt: z.string().min(1),
});
export type SpokeInputRecord = z.infer<typeof SpokeInputRecordSchema>;

// What came back for that attempt, exactly as the hub received it, before the hub validated the
// payload against the task's own schema.
export const SpokeOutputRecordSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  runId: SpokePathSegmentSchema,
  attempt: z.number().int().positive(),
  result: SpokeResultSchema,
  recordedAt: z.string().min(1),
});
export type SpokeOutputRecord = z.infer<typeof SpokeOutputRecordSchema>;

// The spoke definitions the hub can dispatch, one per task type in development plan section 5.3. A
// config `agents.models` entry and a generated subagent are keyed by these ids.
export const SPOKE_DEFINITION_IDS = [
  'explorer',
  'test-design',
  'case-execution',
  'test-generation',
  'triage',
  'reviewer',
  'qa-rca',
] as const;
export const SpokeDefinitionIdSchema = z.enum(SPOKE_DEFINITION_IDS);
export type SpokeDefinitionId = z.infer<typeof SpokeDefinitionIdSchema>;
