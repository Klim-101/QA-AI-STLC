---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.browser_open` and `qa.browser_attach` take `caseId` instead of the `executionMode` flag. Real (non-GET) requests are allowed in a session only for a case of an approved case set: the engine refuses with `EXECUTION_CASE_NOT_APPROVED` until the operator approves the `cases` gate, and again once the case is edited. Callers that passed `executionMode: true` must pass the id of the case they execute.
