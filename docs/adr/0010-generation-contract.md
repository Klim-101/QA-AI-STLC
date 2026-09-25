# ADR-0010: Generation contract

Status: Accepted
Date: 2026-09-25

## Context

`qa-generate-tests` (P3-07) will turn an approved `TestCase` into a runnable Playwright spec, importing locators through the generated module rather than inlining selectors (ADR-006). Before that spoke exists, three things need a fixed shape so the spoke, the verification loop (P3-06) and a later `qa upgrade` (P7-01) can all agree on them: what the spoke is given, what it hands back, and how a human's hand-written additions to a previously generated spec survive the next regeneration.

Left undefined, each of those three future tasks would invent its own version, and P7-01's "regeneration preserving manual edits" would have nothing to preserve against.

## Decision

**Spoke input** (`GenerationSpokeInputSchema`, `@qa-ai-stlc/schemas`): the exact `TestCase`, a **registry slice** — the same `SelectorRegistry` shape, filtered to only the elements the caller identifies as relevant to that case (`buildRegistrySlice`, `@qa-ai-stlc/core`) — and the locator module's current API surface (its `generatorVersion` plus one `{elementId, name}` entry per element it actually exports a function for). Which element ids a case needs is a generation heuristic P3-07 decides at spoke-dispatch time; this contract only fixes the shape once that decision is made.

**Spoke output** (`GeneratedTestSpecSchema`): `testCaseId`, a `generatorVersion` stamp, the target `filePath`, a `sourceHash` (SHA-256 of the canonical-JSON input, `hashText`/`toCanonicalJson`), `generatedAt`, and the generated `content`. It flows through the existing generic `SpokeResultSchema.payload` envelope (`spoke.ts`), validated against this schema before the hub registers it — the same pattern every other spoke payload will use. `stampGeneratedTestSpec`/`isGeneratedTestSpecStale` (`@qa-ai-stlc/core`) build and later check this stamp, mirroring the locator module's own `GENERATOR_VERSION` const and header comment (ADR-006, `generate-locator-module.ts`): a generated spec's `content` carries the same `export const GENERATOR_VERSION = "<version>";` convention, so staleness is detectable by reading the file alone, not only by comparing it against the stamp record.

**Manual preservation:** a human edits inside a generated spec by writing between a marker pair, `// qa:manual:start <id>` and `// qa:manual:end <id>`, anywhere the generator leaves one. `extractManualRegions` (`@qa-ai-stlc/core`) reads every such block out of the file about to be overwritten; `applyManualRegions` splices them back into the freshly generated template by matching `id`. A region whose marker the new template no longer has fails loudly (`core.manual_regions.dropped`) instead of silently discarding hand-written code — the operator moves the code out, or the generator keeps the marker.

## Consequences

P3-06 (verification loop) and P3-07 (the actual `qa-generate-tests` spoke) build directly on these schemas and functions instead of each inventing an ad hoc shape; P7-01 (`qa upgrade`) reuses `extractManualRegions`/`applyManualRegions` unchanged for regeneration. `GenerationSpokeInput`/`GeneratedTestSpec` are spoke I/O, not `.qa/` file artifacts, so they are deliberately not registered in `artifacts.ts`'s JSON Schema export list — the same treatment `SpokeResultSchema` already gets.

The cost is one more marker convention operators must learn (`qa:manual:start`/`qa:manual:end`), and a generator (P3-07) must now deliberately emit these markers around any place it expects hand-editing, rather than leaving the whole file open to edits it would otherwise clobber. The `elementIds` a case needs from the registry is still not derived automatically here; P3-07 must supply that list itself when it builds a spoke input, or defer to a case that already ran through interactive execution (P3-15) and recorded the elements it used.
