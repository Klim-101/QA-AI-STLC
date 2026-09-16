// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema } from './primitives.js';
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
// never changes even when every locator candidate underneath it does.
export const SelectorElementSchema = z.object({
  elementId: IdentifierSchema,
  kind: z.string().min(1),
  library: z.string().optional(),
  locatorCandidates: z.array(LocatorCandidateSchema).min(1),
  stabilityScore: z.number().min(0).max(1),
  lastVerifiedAt: IsoDateTimeSchema,
  pii: z.boolean(),
  dynamicText: z.boolean(),
  source: SelectorElementSourceSchema,
  deprecatedAt: IsoDateTimeSchema.optional(),
});
export type SelectorElement = z.infer<typeof SelectorElementSchema>;

export const SelectorRegistrySchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  elements: z.array(SelectorElementSchema),
});
export type SelectorRegistry = z.infer<typeof SelectorRegistrySchema>;
