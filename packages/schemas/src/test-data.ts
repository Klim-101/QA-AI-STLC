// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { FeatureIdSchema, IdentifierSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// A reusable, non-secret named value a test case's steps or preconditions can reference by name
// (P2-22) — a test user's display name, a product SKU, a sandbox card number, never a credential.
// Credentials stay in identities / `QA_*` environment variables (AGENTS.md 5.8, 14); nothing here
// is scanned as a secret, so nothing secret belongs in it.
export const TestDataValueSchema = z.string().min(1);

export const TestDataSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  id: IdentifierSchema,
  // The tested feature this data set belongs to (P2-20's convention): `qa test-data add` registers
  // it under `artifacts/test-data/<feature>/<id>.json`, the same layout `TestCaseSchema.feature`
  // already uses for cases.
  feature: FeatureIdSchema,
  // Named variables a case references by key, for example a step written as "enter {{cardNumber}}"
  // resolving against `values.cardNumber`. Keys are free-form (not `FeatureIdSchema`-constrained) —
  // a placeholder name is chosen for readability in a step's prose, not for use as a path segment.
  values: z
    .record(z.string().min(1), TestDataValueSchema)
    .refine((values) => Object.keys(values).length > 0, 'must declare at least one value'),
});
export type TestData = z.infer<typeof TestDataSchema>;
