// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { A11yConformanceLevelSchema, A11yExceptionSchema, A11yWcagVersionSchema } from './config.js';
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

export const BrowserActionTypeSchema = z.enum([
  'open',
  'navigate',
  'click',
  'fill',
  // Keyboard and pointer actions (P6-56): `check` records the state the box was read back in.
  'press',
  'hover',
  'check',
  // Component-library widget actions (P6-43): each one verified the widget's resulting state.
  'select-option',
  'set-date',
  'open-popup',
  'close-popup',
  // Grid actions (P6-44): the engine found the row or cell and read it back.
  'grid-find-row',
  'grid-read-cell',
  // An expectation the engine checked in the page (P6-55); the verdict is in `expectation`.
  'expect',
  'snapshot',
  'close',
]);
export type BrowserActionType = z.infer<typeof BrowserActionTypeSchema>;

// The element ref an action was given instead of a selector (ADR-0013): `selector` on the same
// record is what the ref resolved to, so a reader that only wants selectors never needs this.
export const BrowserActionRefSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  name: z.string().optional(),
});
export type BrowserActionRef = z.infer<typeof BrowserActionRefSchema>;

export const BrowserExpectationKindSchema = z.enum([
  'visible',
  'hidden',
  'text',
  'value',
  'count',
  'checked',
  'url',
]);
export type BrowserExpectationKind = z.infer<typeof BrowserExpectationKindSchema>;

// What an `expect` action checked and what the page showed (ADR-0013): the verdict is the
// engine's, never the agent's. `observed` is absent when no single element was there to read.
export const BrowserExpectationSchema = z.object({
  kind: BrowserExpectationKindSchema,
  passed: z.boolean(),
  expected: z.union([z.string(), z.number(), z.boolean()]).optional(),
  observed: z.union([z.string(), z.number(), z.boolean()]).optional(),
  matchCount: z.number().int().nonnegative().optional(),
});
export type BrowserExpectation = z.infer<typeof BrowserExpectationSchema>;

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
  ref: BrowserActionRefSchema.optional(),
  expectation: BrowserExpectationSchema.optional(),
  // The key or chord a `press` sent; a single printable character is recorded as `[character]`.
  key: z.string().min(1).optional(),
  // The state a `check` action read back from the box after setting it.
  checked: z.boolean().optional(),
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

// One axe-core rule result; only the rule id is read back, the rest of the raw result is kept as is.
const AxeRuleResultSchema = z.looseObject({ id: z.string().min(1) });

// The body of an `other`-kind evidence record `runBrowserAccessibilityScan` writes for the `a11y`
// test type (P6-26, P6-28): what the scan ran with and what axe-core decided per rule. `passes`
// and `inapplicable` are kept as rule ids only, which is all the conformance report needs.
export const A11yScanRecordSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  type: z.literal('a11y-scan'),
  axeVersion: z.string().min(1),
  configHash: Sha256HexSchema,
  wcagVersion: A11yWcagVersionSchema,
  level: A11yConformanceLevelSchema,
  bestPractices: z.boolean(),
  tags: z.array(z.string()),
  include: z.array(z.string()),
  exclude: z.array(z.string()),
  violations: z.array(AxeRuleResultSchema),
  excepted: z.array(
    z.object({
      ruleId: z.string().min(1),
      reason: z.string().min(1),
      expires: z.iso.date().optional(),
      violation: z.unknown(),
    }),
  ),
  expiredExceptions: z.array(A11yExceptionSchema),
  uncertain: z.array(AxeRuleResultSchema),
  passedRuleIds: z.array(z.string().min(1)),
  inapplicableRuleIds: z.array(z.string().min(1)),
});
export type A11yScanRecord = z.infer<typeof A11yScanRecordSchema>;

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
