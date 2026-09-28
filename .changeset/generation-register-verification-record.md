---
'@qa-ai-stlc/schemas': patch
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/mcp-server': patch
'@qa-ai-stlc/cli': patch
---

`qa.generation_register` no longer trusts a verification outcome supplied by the caller. `qa.generation_verify` now records every outcome as an engine-written, manifest-registered verification record under `.qa/verifications/` and returns its `verificationId`; `qa.generation_register` takes the `spec` and that `verificationId` instead of `result` and `contentSha256`. Registration is rejected with a coded error when no such record exists, the record was edited, it did not end `verified`, it was already used, or the spec's test case, file path or content differ from what was verified. Verification also requires the test case to be registered and unchanged. `qa init` adds `/verifications/` to `.qa/.gitignore`.
