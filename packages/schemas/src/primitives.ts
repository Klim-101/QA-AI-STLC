// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

export const Sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'must be a lowercase 64-character SHA-256 hex digest');
export type Sha256Hex = z.infer<typeof Sha256HexSchema>;

// Artifact paths are project-relative and use `/` on every OS (AGENTS.md 5.6), never an absolute
// path or a Windows backslash, so a hash or a reference recorded on one OS still resolves on
// another. A drive-letter prefix (`C:/x`, `C:x`) is also absolute on Windows even though it
// starts with neither `/` nor `\`.
const DRIVE_LETTER_PREFIX = /^[A-Za-z]:/;

export const RelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !DRIVE_LETTER_PREFIX.test(value) &&
      !value.split('/').includes('..'),
    'must be a project-relative, forward-slash path with no ".." segments',
  );
export type RelativePath = z.infer<typeof RelativePathSchema>;

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const IdentifierSchema = z.string().min(1);
export type Identifier = z.infer<typeof IdentifierSchema>;

// An explicit, operator-chosen name for a tested feature (P2-20) — the folder a test case's
// artifact lives under (`artifacts/cases/<feature>/<id>.json`), never inferred from a case's title
// or requirement id. Kebab-case keeps it a safe, predictable path segment on every OS.
export const FeatureIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case: lowercase letters, digits and single hyphens');
export type FeatureId = z.infer<typeof FeatureIdSchema>;

// A place in source the engine found something without a live page to point at instead: a
// `source: 'static'` selector element (selector-registry.ts) or a statically-extracted route
// (route-map.ts).
export const SourceLocationSchema = z.object({
  filePath: RelativePathSchema,
  line: z.number().int().positive(),
});
export type SourceLocation = z.infer<typeof SourceLocationSchema>;
