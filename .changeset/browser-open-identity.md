---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
'@qa-ai-stlc/mcp-server': patch
---

`qa.browser_open` takes an optional `identity` and signs the interactive session in before the first navigation, so `qa-execute` can run a case on an application behind a login page. The result names the identity and never carries its session.
