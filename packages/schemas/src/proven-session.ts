// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { BrowserActionSchema, HttpRequestRecordSchema } from './evidence.js';
import { IdentifierSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// What one `qa.browser_*`/`qa.http_execute` call actually did during a case step (P3-15), read
// back from the evidence content it wrote — `stepId` is what groups these by the case step they
// proved. Not a new evidence kind: the same `BrowserActionSchema`/`HttpRequestRecordSchema` content
// evidence already carries, reused here for recovery rather than re-derived.
export const ProvenActionSchema = z.union([BrowserActionSchema, HttpRequestRecordSchema]);
export type ProvenAction = z.infer<typeof ProvenActionSchema>;

// Every proven action for one case step (`'step-<N>'`, `N` its 1-based position in the case's
// `steps`), in the order they were performed.
export const ProvenStepSchema = z.object({
  stepId: IdentifierSchema,
  description: z.string().min(1),
  actions: z.array(ProvenActionSchema).min(1),
});
export type ProvenStep = z.infer<typeof ProvenStepSchema>;

// A case's most recent passing `qa-execute` session (P3-15), recovered from its `RunResult` and
// the evidence trail that result's `evidenceIds` point to (`findLatestProvenSession`,
// `@qa-ai-stlc/core`) — not a dedicated session-log artifact (decisions log, P3-07, 2026-09-25).
// `qa-generate-tests` embeds this in a `GenerationSpokeInput` so re-running `qa-execute` for the
// case changes `sourceHash` and marks a previously generated spec stale, the same mechanism
// `isGeneratedTestSpecStale` already uses for the case/registry.
export const ProvenSessionSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  testCaseId: IdentifierSchema,
  runResultId: IdentifierSchema,
  steps: z.array(ProvenStepSchema).min(1),
});
export type ProvenSession = z.infer<typeof ProvenSessionSchema>;
