---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.http_execute` takes `auth`, the name of an `apiAuth` profile, and the engine adds the credential itself. A raw `Authorization` or `Cookie` header, a header or query parameter that any profile declares, is now rejected with `HTTP_CREDENTIAL_INPUT_REJECTED` and a remediation pointing at profiles. OAuth tokens are cached for the life of the MCP server process.
