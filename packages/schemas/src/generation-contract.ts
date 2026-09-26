// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { IdentifierSchema, RelativePathSchema, Sha256HexSchema, IsoDateTimeSchema } from './primitives.js';
import { ProvenSessionSchema } from './proven-session.js';
import { SelectorRegistrySchema } from './selector-registry.js';
import { TestCaseSchema } from './test-case.js';
import { SCHEMA_VERSION, SchemaVersionSchema } from './version.js';

// One entry per element the locator module (ADR-006) actually exports a function for, so a spoke
// generating a spec knows the exact import name to reference without re-deriving it from the
// registry's own `name` field (which a future registry format could rename without moving the
// generated locator module's export).
export const LocatorModuleExportSchema = z.object({
  elementId: IdentifierSchema,
  name: z.string().min(1),
});
export type LocatorModuleExport = z.infer<typeof LocatorModuleExportSchema>;

// What a `qa-generate-tests` spoke task (P3-07) receives: the case to codify, the slice of the
// selector registry its steps are expected to need, and the generated locator module's own current
// API surface, so the spoke never has to inline a selector or guess an export name (ADR-006).
export const GenerationSpokeInputSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  testCase: TestCaseSchema,
  // A subset of a real `SelectorRegistry` (`buildRegistrySlice`, `@qa-ai-stlc/core`): same shape,
  // `elements` filtered to only the ids the caller identified as relevant to this case. Not the
  // whole project registry, so a spoke's context stays bounded to one case at a time.
  registrySlice: SelectorRegistrySchema,
  locatorModule: z.object({
    generatorVersion: z.string().min(1),
    exports: z.array(LocatorModuleExportSchema),
  }),
  // The case's most recent passing `qa-execute` session (P3-15), when one exists
  // (`findLatestProvenSession`, `@qa-ai-stlc/core`) — what `qa-generate-tests` (P3-07) actually
  // codifies. Included here, not passed alongside the input, specifically so it is part of
  // `sourceHash`: re-running `qa-execute` for the case changes this field and therefore the hash,
  // so `isGeneratedTestSpecStale` catches that drift with no separate detection mechanism.
  provenSession: ProvenSessionSchema.optional(),
});
export type GenerationSpokeInput = z.infer<typeof GenerationSpokeInputSchema>;

// A `// qa:manual:start <id>` / `// qa:manual:end <id>` block a human edited inside a previously
// generated spec. `extractManualRegions`/`applyManualRegions` (`@qa-ai-stlc/core`) round-trip these
// verbatim across regeneration so a spoke's own retry loop (P3-06) or a later `qa upgrade` (P7-01)
// never overwrites hand-written additions.
export const ManualRegionSchema = z.object({
  id: IdentifierSchema,
  content: z.string(),
});
export type ManualRegion = z.infer<typeof ManualRegionSchema>;

// The spoke's output payload for a `generate-test-spec` task, validated against the generic
// `SpokeResultSchema.payload` envelope (`spoke.ts`) before the hub registers it. `sourceHash` is
// the SHA-256 of the exact `GenerationSpokeInput` that produced `content` (canonical JSON,
// `hashText` from `@qa-ai-stlc/core`) — the verification loop (P3-06) and a future
// `qa validate --generated` can detect a spec that has drifted from the case/registry it was built
// from without re-running generation. `generatorVersion` mirrors the locator module's own
// `GENERATOR_VERSION` stamp (ADR-006): the same value must also appear as a `GENERATOR_VERSION`
// export inside `content`, so a stale generated file is detectable by reading the file alone, not
// only by comparing it against this record.
export const GeneratedTestSpecSchema = z.object({
  schemaVersion: SchemaVersionSchema.default(SCHEMA_VERSION),
  testCaseId: IdentifierSchema,
  generatorVersion: z.string().min(1),
  filePath: RelativePathSchema,
  sourceHash: Sha256HexSchema,
  generatedAt: IsoDateTimeSchema,
  content: z.string().min(1),
});
export type GeneratedTestSpec = z.infer<typeof GeneratedTestSpecSchema>;
