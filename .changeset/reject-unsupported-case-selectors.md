---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
'@qa-ai-stlc/cli': minor
---

`qa cases add` rejects a case whose expectation uses a selector engine the browser tools cannot run (`label=`, `testid=`), with `CASE_SELECTOR_UNSUPPORTED` naming the step and the accepted forms. The browser tools share the same check and fail with `BROWSER_SELECTOR_UNSUPPORTED` instead of a raw Playwright error.
