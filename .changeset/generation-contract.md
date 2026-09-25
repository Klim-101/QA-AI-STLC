---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/schemas': minor
---

Add the generation contract (P3-05, ADR-0010) a future `qa-generate-tests` spoke (P3-07) and its
verification loop (P3-06) build on: `GenerationSpokeInputSchema`/`GeneratedTestSpecSchema`
(`@qa-ai-stlc/schemas`) fix the spoke's input (a case, a registry slice, the locator module's
current exports) and output (a generated spec stamped with a `generatorVersion` and a
`sourceHash`); `buildRegistrySlice`/`buildGenerationSpokeInput`/`stampGeneratedTestSpec`/
`isGeneratedTestSpecStale` (`@qa-ai-stlc/core`) assemble and check them.
`extractManualRegions`/`applyManualRegions` (`@qa-ai-stlc/core`) round-trip a human's
`// qa:manual:start <id>` / `// qa:manual:end <id>` edits inside a generated spec across
regeneration, reused unchanged by a later `qa upgrade` (P7-01).
