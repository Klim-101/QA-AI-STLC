---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

Add `qa.browser_attach`: attach to a Chrome the operator started with `--remote-debugging-port` and already signed into, as a browser session the `qa.browser_*` tools and `from-browser` API auth profiles can use. Only loopback endpoints are accepted, safe mode and the allowlist apply to the driven page only, and closing the session disconnects without closing the operator's browser.
