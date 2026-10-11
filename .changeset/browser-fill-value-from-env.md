---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/mcp-server': patch
---

`qa.browser_fill` takes `valueFromEnv`, the name of a `QA_*` environment variable the engine reads itself, so a password or other credential can be typed without passing through the agent.
