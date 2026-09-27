// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IsoDateTimeSchema, Sha256HexSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

export const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

// Matches the three contract sources `api.source` allows in config.yaml (development plan
// section 3.3): a supplied or discovered document, or an operator-approved synthesized draft.
export const ApiEndpointSourceSchema = z.enum(['openapi', 'discovered', 'synthesized']);
export type ApiEndpointSource = z.infer<typeof ApiEndpointSourceSchema>;

export const ApiEndpointSchema = z.object({
  method: HttpMethodSchema,
  path: z.string().min(1),
  operationId: z.string().optional(),
  source: ApiEndpointSourceSchema,
  // A capped sample of the raw, untemplated paths this endpoint was collapsed from (a
  // `discovered` endpoint's evidence for the templating decision — AGENTS.md 12.7's "does the
  // computed value match what gets read back" applies to path templating too, so the originals
  // stay inspectable instead of being silently discarded).
  examples: z.array(z.string().min(1)).optional(),
});
export type ApiEndpoint = z.infer<typeof ApiEndpointSchema>;

export const ApiSurfaceSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  contractSha256: Sha256HexSchema.optional(),
  endpoints: z.array(ApiEndpointSchema),
});
export type ApiSurface = z.infer<typeof ApiSurfaceSchema>;
