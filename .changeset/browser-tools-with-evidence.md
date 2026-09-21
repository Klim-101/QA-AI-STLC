---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

Add the `browser.*` MCP tools, the only way an agent may drive a browser (ADR-005):
`qa.browser_open`, `qa.browser_navigate`, `qa.browser_click`, `qa.browser_fill`,
`qa.browser_snapshot` and `qa.browser_close`. Every one of them registers what it did as hashed,
timestamped evidence under the session's run before it returns, so an exploratory session leaves
a complete trail and a screenshot that the engine did not register is not a representable
outcome. A session runs in safe mode with no opt-out — every non-GET request is aborted — and
navigation is limited to the environment's domain allowlist, failing with
`BROWSER_URL_NOT_ALLOWED` otherwise.

`@qa-ai-stlc/core` gains `BrowserSessionStore` (the live sessions, which outlive a single MCP
call and are closed lazily after an idle timeout), `createBrowserSafeModeRouteHandler`,
`isUrlAllowed`/`assertUrlAllowed`, the `IdGenerator` port, and one `runBrowser*` operation per
tool. `AuthPage` gains `url()`, `title()` and `screenshot()`.

`@qa-ai-stlc/schemas` gains the additive `action` evidence kind and `BrowserActionSchema`, the
body of an action record. A filled value is recorded only by its length, never the value itself.
