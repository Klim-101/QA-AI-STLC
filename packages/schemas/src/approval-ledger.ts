// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { TestingScopeSchema } from './config.js';
import { IsoDateTimeSchema, RelativePathSchema, Sha256HexSchema } from './primitives.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// One entry per hash-bound gate (ADR-003): `artifactSha256` is the hash of the exact artifact
// content approved. `qa validate` recomputes the current artifact's hash and compares it to this
// value; a mismatch means the gate is no longer satisfied regardless of any status field on the
// artifact itself.
export const ApprovalSchema = z.object({
  gate: z.string().min(1),
  artifactPath: RelativePathSchema,
  artifactSha256: Sha256HexSchema,
  approvedBy: z.string().min(1),
  approvedAt: IsoDateTimeSchema,
  note: z.string().optional(),
  // The testing scope (P2-16) in effect at approval time, recorded only for a gate whose
  // satisfaction depends on it (the `cases` gate). A later `qa config set testing.<type>` changing
  // this out from under the approval reopens the gate the next time it is recomputed, the same way
  // editing the approved artifact's content does (ADR-003) — an approval with no snapshot here (a
  // `scope` approval, or one recorded before this field existed) is never scope-checked.
  testingScope: TestingScopeSchema.optional(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const ApprovalLedgerSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  approvals: z.array(ApprovalSchema),
});
export type ApprovalLedger = z.infer<typeof ApprovalLedgerSchema>;
