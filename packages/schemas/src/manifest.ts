// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IsoDateTimeSchema, RelativePathSchema, Sha256HexSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

export const ManifestEntrySchema = z.object({
  sha256: Sha256HexSchema,
  registeredAt: IsoDateTimeSchema,
});
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;

// `.qa/manifest.json`: the hash of every registered artifact (AGENTS.md 2.5). `qa validate` and
// every MCP mutation reject a file that is unregistered or whose content no longer matches its
// recorded hash, so an agent cannot make a direct filesystem write pass for an engine-produced
// artifact.
export const ManifestSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  // Keyed by the artifact's project-relative path.
  artifacts: z.record(RelativePathSchema, ManifestEntrySchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;
