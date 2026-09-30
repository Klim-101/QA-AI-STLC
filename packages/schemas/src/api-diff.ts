// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { HttpMethodSchema } from './api-surface.js';
import { IsoDateTimeSchema, Sha256HexSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// `matched` agrees on both sides. `undocumented`: observed in traffic but absent from the
// contract. `method-not-documented`: the path is in the contract, but not under the observed
// method. `unobserved`: in the contract but never seen in traffic, which is weaker evidence than
// the others because a crawl only exercises what the UI calls.
export const ApiDiffKindSchema = z.enum(['matched', 'undocumented', 'method-not-documented', 'unobserved']);
export type ApiDiffKind = z.infer<typeof ApiDiffKindSchema>;

export const ApiDiffFindingSchema = z.object({
  kind: ApiDiffKindSchema,
  method: HttpMethodSchema,
  path: z.string().min(1),
  // The contract's own spelling of the path (`/tasks/{taskId}`), when it differs from the
  // observed template (`/tasks/{id}`).
  contractPath: z.string().min(1).optional(),
  examples: z.array(z.string().min(1)).optional(),
});
export type ApiDiffFinding = z.infer<typeof ApiDiffFindingSchema>;

export const ApiDiffReportSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  generatedAt: IsoDateTimeSchema,
  contract: z.object({
    // A project-relative path or an absolute URL; never a credential-bearing value.
    source: z.string().min(1),
    sha256: Sha256HexSchema,
  }),
  counts: z.object({
    matched: z.number().int().nonnegative(),
    undocumented: z.number().int().nonnegative(),
    methodNotDocumented: z.number().int().nonnegative(),
    unobserved: z.number().int().nonnegative(),
  }),
  findings: z.array(ApiDiffFindingSchema),
});
export type ApiDiffReport = z.infer<typeof ApiDiffReportSchema>;
