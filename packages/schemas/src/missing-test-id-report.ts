// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IsoDateTimeSchema } from './primitives.js';
import { SelectorElementSourceSchema, SourceLocationSchema } from './selector-registry.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// `sourceLocation` (never split into separate optional `filePath`/`line` fields) is known only
// for a `source: 'static'` entry (selector-registry.ts); a `crawl` or `manual` element has no
// source file to point a developer at, and this report says so rather than guessing (development
// plan section 6.3 step 9).
export const MissingTestIdEntrySchema = z.object({
  elementId: z.string().min(1),
  name: z.string().min(1).optional(),
  kind: z.string().min(1),
  source: SelectorElementSourceSchema,
  sourceLocation: SourceLocationSchema.optional(),
});
export type MissingTestIdEntry = z.infer<typeof MissingTestIdEntrySchema>;

export const MissingTestIdReportSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  entries: z.array(MissingTestIdEntrySchema),
});
export type MissingTestIdReport = z.infer<typeof MissingTestIdReportSchema>;
