---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.http_execute` sends a method other than GET, HEAD, OPTIONS or QUERY only for a case of an approved case set: it takes `caseId` and refuses with `HTTP_EXECUTE_CASE_REQUIRED` without one and `EXECUTION_CASE_NOT_APPROVED` until the operator approves the `cases` gate. Reads need no case. Callers that sent a POST, PUT, PATCH or DELETE must now pass the id of the case they execute.
