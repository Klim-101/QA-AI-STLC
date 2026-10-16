---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.browser_open` takes `headed` to open the interactive session in a visible window, so an operator can watch a `qa-execute` run or sign in by hand. The environment gets a `headed` setting as the default (a machine setting the local layer may set, shown by `qa config show`); the input overrides it either way. A headed session keeps safe mode, the domain allowlist, evidence registration and secret scanning, and the result's `headed` says which mode was launched. A machine without a display gets `BROWSER_HEADED_UNAVAILABLE` with a remediation instead of a raw Playwright message. The `qa-execute` guidance tells the agent to offer it when the operator wants to watch.
