// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

function isValidRegexSource(value: string): boolean {
  try {
    new RegExp(value, 'iu');
    return true;
  } catch {
    return false;
  }
}

// How a run shows that it found a catalogued bug. `requirement`: the run holds a failed case or a
// registered defect draft linked to the requirement the bug violates. Requirement ids come from the
// scenario's own requirements file, so they are the same in every host, unlike case ids and defect
// wording, which each agent chooses. `failed-case` (the latest result of a named case failed) and
// `defect-title` (a defect draft whose title matches) fit only a run that happens to use that id or
// that wording, such as the scripted baseline.
export const EvalBugSignalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('requirement'), requirementId: IdentifierSchema }),
  z.object({ kind: z.literal('failed-case'), testCaseId: IdentifierSchema }),
  z.object({
    kind: z.literal('defect-title'),
    pattern: z.string().min(1).refine(isValidRegexSource, 'must be a valid regular expression'),
  }),
]);
export type EvalBugSignal = z.infer<typeof EvalBugSignalSchema>;

export const EvalExpectedBugSchema = z.object({
  // The id in `examples/demo-app/bugs.json`.
  bugId: z.string().regex(/^BUG-\d{3}$/u),
  signals: z
    .array(EvalBugSignalSchema)
    .min(1)
    .describe('Any one of them counts as the run having found the bug.'),
});
export type EvalExpectedBug = z.infer<typeof EvalExpectedBugSchema>;

// A fixed scenario of the agent-layer eval set (development plan section 8): what a run on the demo
// app is expected to find. The same scenario scores a scripted baseline and a run by a real agent.
export const EvalScenarioSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  title: z.string().min(1),
  expectedBugs: z.array(EvalExpectedBugSchema).min(1),
});
export type EvalScenario = z.infer<typeof EvalScenarioSchema>;

export const EvalBugResultSchema = z.object({
  bugId: z.string(),
  isDetected: z.boolean(),
  // What showed it, when it was found: a case id, or a defect id.
  evidence: z.string().optional(),
});
export type EvalBugResult = z.infer<typeof EvalBugResultSchema>;

export const EvalSpokeMetricsSchema = z.object({
  spokeId: z.string(),
  attempts: z.number().int().nonnegative(),
  okResponses: z.number().int().nonnegative(),
  errorResponses: z.number().int().nonnegative(),
  // Dispatched, never answered.
  unanswered: z.number().int().nonnegative(),
  totalDurationMs: z.number().int().nonnegative(),
});
export type EvalSpokeMetrics = z.infer<typeof EvalSpokeMetricsSchema>;

// What a run measured. A rate is `null` when there was nothing to divide by: zero is a result, not
// the absence of one (AGENTS.md 12.7). Token use and cost are not here on purpose: the engine reads
// no host transcript (development plan section 4), so it has nothing true to say about them.
export const EvalReportSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  scenarioId: z.string(),
  generatedAt: IsoDateTimeSchema,
  bugs: z.object({
    expectedCount: z.number().int().nonnegative(),
    detectedCount: z.number().int().nonnegative(),
    detectionRate: z.number().min(0).max(1).nullable(),
    results: z.array(EvalBugResultSchema),
  }),
  spokes: z.object({
    attempts: z.number().int().nonnegative(),
    okResponses: z.number().int().nonnegative(),
    errorResponses: z.number().int().nonnegative(),
    unanswered: z.number().int().nonnegative(),
    // Tasks that needed more than one attempt.
    retriedTaskCount: z.number().int().nonnegative(),
    // Attempts answered with `ok`, over every attempt dispatched.
    validResponseRate: z.number().min(0).max(1).nullable(),
    bySpoke: z.array(EvalSpokeMetricsSchema),
  }),
  selectors: z.object({
    elementCount: z.number().int().nonnegative(),
    meanStabilityScore: z.number().min(0).max(1).nullable(),
    // Elements whose primary locator is marked fragile.
    fragileCount: z.number().int().nonnegative(),
  }),
  duration: z.object({
    // From the first spoke input to the last spoke output; `null` when no spoke ran.
    spokeSpanMs: z.number().int().nonnegative().nullable(),
  }),
  notMeasured: z.array(z.enum(['tokens', 'cost'])),
});
export type EvalReport = z.infer<typeof EvalReportSchema>;
