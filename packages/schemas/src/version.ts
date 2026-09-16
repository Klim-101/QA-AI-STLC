// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

// Every artifact schema carries this version so `qa validate` and the upgrade path (development
// plan section 9) can detect an artifact written by an older, incompatible schema instead of
// misreading its fields silently.
export const SCHEMA_VERSION = 1;

export const SchemaVersionSchema = z.literal(SCHEMA_VERSION);
export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;
