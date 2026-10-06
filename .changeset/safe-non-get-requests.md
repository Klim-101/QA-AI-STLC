---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Add `safeNonGetRequests` to an environment (ADR-0014): named `POST` requests (exact path, written reason) that safe mode lets through in every safe-mode session, so an application that opens its session with a POST can be explored. `qa explore` and `qa.browser_close` list what was let through and what was blocked, by method and path; an entry only a local config layer adds is reported as a relaxation; `qa config add environment` takes `--allow-request` and `--allow-request-reason`, and no MCP tool can set the list.
