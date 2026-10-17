// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { SpokePathSegmentSchema } from './spoke.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

const CountSchema = z.number().int().nonnegative();
const MillisecondsSchema = z.number().int().nonnegative();

export const RunMetricsSpokeSchema = z.object({
  spokeId: z.string(),
  tasks: CountSchema,
  attempts: CountSchema,
  // Attempts beyond the first of each task.
  retriesUsed: CountSchema,
});
export type RunMetricsSpoke = z.infer<typeof RunMetricsSpokeSchema>;

/**
 * How a run of the agent layer was carried out, read from the spoke I/O store and the `agents`
 * budgets of the configuration, and from nothing else (development plan sections 4 and 5.3). There
 * is no token count and no cost in it on purpose: they would have to come from the host's own
 * transcript, which the engine does not read.
 */
export const RunMetricsSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  runId: SpokePathSegmentSchema,
  // The `agents` budgets the figures below are set against.
  budgets: z.object({
    parallelism: CountSchema,
    spokeTimeoutSeconds: CountSchema,
    retries: CountSchema,
  }),
  dispatch: z.object({
    tasks: CountSchema,
    attempts: CountSchema,
    okResponses: CountSchema,
    errorResponses: CountSchema,
    unanswered: CountSchema,
    bySpoke: z.array(RunMetricsSpokeSchema),
  }),
  retries: z.object({
    used: CountSchema,
    // What the budget allows for these tasks: `agents.retries` for each.
    allowed: CountSchema,
    // Tasks that used every attempt the budget gives them.
    tasksAtBudget: CountSchema,
    // Tasks recorded with more attempts than the budget gives; the engine refuses these, so a
    // count above zero means the records were written outside it.
    tasksOverBudget: CountSchema,
  }),
  timing: z.object({
    // From the first dispatch to the last answer; `null` when nothing was answered.
    spanMs: MillisecondsSchema.nullable(),
    // The time of every answered attempt added up: what the same attempts take one after another.
    busyMs: MillisecondsSchema,
    // The time at least one answered attempt was running.
    activeMs: MillisecondsSchema,
    // What running attempts together saved over running them one after another (`busyMs - activeMs`).
    overlapSavingMs: MillisecondsSchema,
    // Dispatched, never answered, and older than `agents.spokeTimeoutSeconds`.
    timedOutAttempts: CountSchema,
  }),
  concurrency: z.object({
    // The most attempts running at once.
    peak: CountSchema,
    isWithinBudget: z.boolean(),
  }),
});
export type RunMetrics = z.infer<typeof RunMetricsSchema>;
