---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Add reusable, non-secret test-data sets (P2-22): `TestDataSchema` (`packages/schemas`) is a named
set of key/value variables, and `TestCaseSchema` gains an optional `testDataRefs` array so a case's
steps or preconditions can reference shared values by id instead of inlining them.

`qa test-data add` / `qa.test_data_add` validates a set and registers it under
`artifacts/test-data/<feature>/<id>.json` (P2-20's feature-folder convention). `qa validate` now
also rejects a case whose `testDataRefs` entry does not resolve to a registered set, reported as a
new `unresolvedTestData` field on the validate report — both are additive, so nothing existing
changes shape.

Never holds credentials — those stay in identities / `QA_*` environment variables.
