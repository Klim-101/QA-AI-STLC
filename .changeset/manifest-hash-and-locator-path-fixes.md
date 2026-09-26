---
'@qa-ai-stlc/explorer': patch
'@qa-ai-stlc/core': patch
---

Fixes two bugs that made `qa validate` always report false tampering right after a clean `qa
explore`: `persistExploreResult` registered `selectors/registry.json` and
`selectors/missing-test-ids.json` with a hash computed from a differently-formatted
`JSON.stringify` than what was actually written to disk, and `qa validate`'s tamper sweep resolved
`tests/qa/locators.ts` (registered outside `.qa/`, per ADR-006) under `.qa/` instead of the project
root.
