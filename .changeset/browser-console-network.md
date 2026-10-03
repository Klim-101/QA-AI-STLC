---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.browser_console` and `qa.browser_network` read back what a session's pages logged and requested. The console tool returns messages and uncaught exceptions as level and text, redacted of secret shapes and capped; the network tool returns method, status or failure, and a templated URL (identifiers become `:id`, query parameters keep their names but never their values). Neither reads a header, cookie or body. Both take a `since` cursor, a `limit` (at most 100) and `errorsOnly`, report how many entries were left out or already dropped, and register the full redacted log as evidence.
