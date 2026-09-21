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
export const BrowserActionSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  type: BrowserActionTypeSchema,
  sessionId: IdentifierSchema,
  url: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  valueLength: z.number().int().nonnegative().optional(),
  httpStatus: z.number().int().positive().optional(),
  at: IsoDateTimeSchema,
});
export type BrowserAction = z.infer<typeof BrowserActionSchema>;

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
