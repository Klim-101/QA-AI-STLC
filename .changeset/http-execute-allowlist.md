---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/mcp-server': patch
---

Fixes `qa.http_execute` (#364): it made a real HTTP call to any URL it was given, with no check
against the environment's configured domain allowlist — the only `qa.browser_*`-adjacent tool that
didn't. `runHttpExecute` now resolves the environment (a new optional `environment` option, same
lookup `qa.browser_open` already uses) and rejects a URL off its allowlist with
`BROWSER_URL_NOT_ALLOWED` before making any request. This restricts which host can be called, never
which method: a real POST/PUT/DELETE against an allowed host still works, exactly as `api`
test-type execution requires.
