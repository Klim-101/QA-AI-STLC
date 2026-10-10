---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/runner-security': minor
---

Foundation of the on-demand black-box security audit (no command or MCP tool yet). A security audit authorization (`SecurityAuthorizationSchema`: environment snapshot, check classes, identities, prohibited actions, the exact mutations allowed, rate limit and request budget) is registered and approved through a hash-bound `security-authorization` gate; an audit refuses to start (`SECURITY_NOT_AUTHORIZED`, `SECURITY_AUTHORIZATION_STALE`, `SECURITY_OUT_OF_SCOPE`) unless it is approved, unedited, security testing is in scope and the environment's address and allowlist still match. The new `@qa-ai-stlc/runner-security` package sends every request through one probe that enforces the authorized origin and allowlist, only the authorized non-read requests, the rate limit and the request budget, follows no redirects and logs every request sent or refused. Checks end `passed`, `failed`, `skipped`, `blocked` or `uncertain`; an audit with a blocked check or an exhausted budget is `partial`. Findings are registered as evidence and drafted as `category: security` defect drafts. `HttpClient.request()` now also returns each `Set-Cookie` header separately (`setCookies`).
