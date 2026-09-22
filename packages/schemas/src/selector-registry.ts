// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema, SourceLocationSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

export const LocatorCandidateSchema = z.object({
  strategy: z.string().min(1),
  value: z.string().min(1),
  fragile: z.boolean(),
});
export type LocatorCandidate = z.infer<typeof LocatorCandidateSchema>;

export const SelectorElementSourceSchema = z.enum(['crawl', 'static', 'manual']);
export type SelectorElementSource = z.infer<typeof SelectorElementSourceSchema>;

// `elementId` is the stable key generated tests import through the locator module (ADR-006); it
// never changes even when every locator candidate underneath it does. `locatorCandidates` may be
// empty: the `strict-no-css` synthesis policy deliberately produces no candidate at all for an
// element with no role, test ID, label, placeholder or text signal, and the element is still
// recorded (with `stabilityScore: 0`) rather than silently dropped, so a "missing locator" report
// can surface it.
// `name` is a camelCase identifier derived from the element's human-meaningful name (development
// plan 6.3.4), deduplicated against sibling elements at registry-build time. It is the export name
// the locator module (ADR-006) generates for this element, so it is optional here: a `static` or
// `manual` entry predating this field, or one this package's schema version does not require, has
// no export and is reported as a missing locator instead of failing validation.
// The live page a `crawl`/`manual` element was found on, so `qa explore --verify` (P1-15) knows
// where to navigate to re-check its stored candidates against the current DOM. A `static` entry
// has no live page (it never opened a browser) and never sets this.
// `pii`/`dynamicText` are omitted, not `false`, until real detection exists (#284): no producer in
// this package can actually tell whether an element's text is PII or dynamic today, so asserting
// `false` would claim a check that never ran (AGENTS.md 12.5, honest statuses). A consumer must
// treat a missing value as "not evaluated", never as a passed check.
export const SelectorElementSchema = z.object({
  elementId: IdentifierSchema,
  name: z.string().min(1).optional(),
  kind: z.string().min(1),
  library: z.string().optional(),
  locatorCandidates: z.array(LocatorCandidateSchema),
  stabilityScore: z.number().min(0).max(1),
  lastVerifiedAt: IsoDateTimeSchema,
  pii: z.boolean().optional(),
  dynamicText: z.boolean().optional(),
  source: SelectorElementSourceSchema,
  sourceLocation: SourceLocationSchema.optional(),
  pageUrl: z.string().min(1).optional(),
  deprecatedAt: IsoDateTimeSchema.optional(),
});
export type SelectorElement = z.infer<typeof SelectorElementSchema>;

export const SelectorRegistrySchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  elements: z.array(SelectorElementSchema),
});
export type SelectorRegistry = z.infer<typeof SelectorRegistrySchema>;
