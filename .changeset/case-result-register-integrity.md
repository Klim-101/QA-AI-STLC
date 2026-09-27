---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/mcp-server': patch
---

Fixes `runRegisterCaseResult` / `qa.case_result_register` accepting a fabricated result: it now
rejects a `testCaseId` that does not resolve to a registered test case, an `evidenceIds` entry that
was not actually registered under the given `runId`, and a `passed` result with zero evidence.
Previously none of these were checked at registration time, so a caller could register a permanent,
manifest-backed "passed" result for a test case that does not exist, backed by no real evidence.
