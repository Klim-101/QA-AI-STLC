// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, IsoDateTimeSchema, RelativePathSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

export const RequirementSourceSchema = z.union([
  z.object({ kind: z.literal('file'), path: RelativePathSchema }),
  z.object({ kind: z.literal('text'), label: z.string().min(1) }),
]);
export type RequirementSource = z.infer<typeof RequirementSourceSchema>;

export const RequirementSchema = z.object({
  id: IdentifierSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  source: RequirementSourceSchema,
  inScope: z.boolean(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

// `qa scope` renders this artifact from the operator's requirement sources (development plan
// section 2.4); the framework never fetches requirements from a tracker itself.
export const ScopeSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  requirements: z.array(RequirementSchema),
});
export type Scope = z.infer<typeof ScopeSchema>;
