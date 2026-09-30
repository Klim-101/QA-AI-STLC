---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/runner-api': minor
'@qa-ai-stlc/mcp-server': minor
---

Generate API specs through the verification loop. For an `api` case, `qa.generation_spoke_input` returns `apiContract` (the contract operations the case names, plus the contract SHA-256) instead of a registry slice and locator module, and `qa.generation_verify` runs the spec through `runner-api`. A generated API spec must declare `export const CONTRACT_SHA256 = "<hash>"`: verification rejects a spec that does not match the input's hash, and `runner-api` rejects a spec once the live contract hashes differently (`API_SPEC_CONTRACT_CHANGED`). `registrySlice` and `locatorModule` are now optional in the spoke input schema and required only for non-`api` cases. The `qa-generate-tests` skill documents the API flow.
