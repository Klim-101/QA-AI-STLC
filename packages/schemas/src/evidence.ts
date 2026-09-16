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
  'other',
]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

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
