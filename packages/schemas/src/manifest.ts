// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IsoDateTimeSchema, RelativePathSchema, Sha256HexSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// Which hasher (`hashText`/`hashBytes`, `packages/core/src/hash.ts`) produced `sha256`, recorded
// so a later verification checks the artifact the same way it was registered instead of guessing
// (#303): `hashText` normalizes CRLF to LF, so trying both encodings against an unknown-mode
// artifact lets a CRLF-only edit to byte-registered content pass as unchanged.
export const ManifestEntryModeSchema = z.enum(['text', 'bytes']);
export type ManifestEntryMode = z.infer<typeof ManifestEntryModeSchema>;

// Which tree a registered path is relative to: `.qa/` (the default, left out of the entry) or the
// project root, for what the engine writes into the project (generated specs, the locator module).
// Without it a path alone cannot say where to look for the file.
export const ManifestEntryRootSchema = z.enum(['qa', 'project']);
export type ManifestEntryRoot = z.infer<typeof ManifestEntryRootSchema>;

export const ManifestEntrySchema = z.object({
  sha256: Sha256HexSchema,
  mode: ManifestEntryModeSchema,
  registeredAt: IsoDateTimeSchema,
  root: ManifestEntryRootSchema.optional(),
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
