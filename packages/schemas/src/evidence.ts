// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema, RelativePathSchema, Sha256HexSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

export const EvidenceKindSchema = z.enum([
  'screenshot',
  'trace',
  'network-har',
  'console-log',
  'video',
  // One discrete thing the engine did in a browser — a navigation, a click, a fill (ADR-005).
  // Its content is a `BrowserAction` document rather than a captured media file.
  'action',
  'other',
]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const BrowserActionTypeSchema = z.enum(['open', 'navigate', 'click', 'fill', 'snapshot', 'close']);
export type BrowserActionType = z.infer<typeof BrowserActionTypeSchema>;

// The body of an `action` evidence record (ADR-005): what the engine did, where, and when. A
// filled value is described only by its length — the value itself is never persisted, whether or
// not the secret scanner would have recognized it (AGENTS.md 5.8, 12.4).
//
// `stepId` is carried here, in the persisted content, rather than only on the `Evidence` wrapper
// (below) — the wrapper is never written to disk on its own, only the content this schema
// describes is (`EvidenceStore.register`), so `qa-generate-tests` (P3-07) recovering a proven
// session's steps from evidence later has nowhere else to read it back from.
export const BrowserActionSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  type: BrowserActionTypeSchema,
  sessionId: IdentifierSchema,
  stepId: IdentifierSchema.optional(),
  url: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  valueLength: z.number().int().nonnegative().optional(),
  httpStatus: z.number().int().positive().optional(),
  at: IsoDateTimeSchema,
});
export type BrowserAction = z.infer<typeof BrowserActionSchema>;

// The body of an `other`-kind evidence record `runHttpExecute` writes for the `api` test type
// (P3-14): the request/response pair, capped at a preview length. `stepId` follows the same
// `'step-<N>'` convention `BrowserActionSchema` carries, for the same reason: it is what
// `qa-generate-tests` (P3-07) reads back later to recover a proven session's steps.
export const HttpRequestRecordSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  type: z.literal('http-request'),
  stepId: IdentifierSchema.optional(),
  method: z.string().min(1),
  url: z.string().min(1),
  status: z.number().int(),
  responseHeaders: z.record(z.string(), z.string()),
  bodyPreview: z.string(),
  truncated: z.boolean(),
  at: IsoDateTimeSchema,
});
export type HttpRequestRecord = z.infer<typeof HttpRequestRecordSchema>;

// Evidence is created and hashed by the engine only (AGENTS.md 2.5, 12.5); an agent can reference
// a file here but cannot register one that the engine did not itself write and scan.
export const EvidenceSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  id: IdentifierSchema,
  runId: IdentifierSchema,
  stepId: IdentifierSchema.optional(),
  kind: EvidenceKindSchema,
  path: RelativePathSchema,
  sha256: Sha256HexSchema,
  createdAt: IsoDateTimeSchema,
  redacted: z.boolean(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// Written in place of an `Evidence` record when a secret scan finds a leak (AGENTS.md 12.5): the
// leaking content is never written to disk, and this receipt names only the kind of pattern
// found, never the matched value.
export const EvidenceQuarantineReceiptSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  id: IdentifierSchema,
  runId: IdentifierSchema,
  stepId: IdentifierSchema.optional(),
  kind: EvidenceKindSchema,
  createdAt: IsoDateTimeSchema,
  reason: z.literal('secret-detected'),
  patterns: z.array(z.string().min(1)).min(1),
});
export type EvidenceQuarantineReceipt = z.infer<typeof EvidenceQuarantineReceiptSchema>;
