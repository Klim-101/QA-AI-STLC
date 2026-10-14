---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/runner-security': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

The security audit that `runner-security` can run is now reachable on demand. `qa security authorize --path <file>`, `qa security approve --approved-by <name>` and `qa security audit` (and the MCP tools `qa.security_authorize`, `qa.security_approve`, `qa.security_audit`) register the audit authorization, record the operator's approval of its exact content, and run the authorized checks, filing every finding as a defect draft that is not accepted. All three refuse with `SECURITY_OUT_OF_SCOPE` unless `testing.security` is `in-scope`, and the audit refuses to start without an approved, current authorization. The new `qa-security` skill drafts the authorization, puts it in front of the operator, waits for their approval and reports the result; it fires only on a request for a security audit and is never called by the pipeline. `qa security audit` exits non-zero when it found something or stopped early.
