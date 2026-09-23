---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
---

Fix `isUrlAllowed`/`assertUrlAllowed` (`@qa-ai-stlc/core`) only ever comparing a URL's hostname
against the domain allowlist, never its scheme or port: `http://staging.example.test:9999/` passed
against an allowlist of `['staging.example.test']` even when the environment's configured
`baseUrl` was `https://staging.example.test/` on the default port. A redirect or attacker-supplied
link to the same host on plain HTTP, or on an arbitrary port, was treated as in-scope by every
safe-mode enforcement point: `qa.browser_navigate`/`qa.browser_open` sessions, and `qa explore`'s
crawl, page analysis, selector-registry build and `--verify` passes.

Both functions now also require the effective scheme and port (explicit, or the scheme's default)
to match the environment's `baseUrl` — one environment is one scheme-and-port policy across every
allowed host, not just `baseUrl`'s own. `BrowserSession` now carries its `baseUrl` alongside its
allowlist so `qa.browser_navigate` can enforce this on a session opened earlier, and every
explorer entry point (`crawl`, `analyzePages`, `buildSelectorRegistry`, `qa explore --verify`)
threads the environment's `baseUrl` through the same way it already threads the allowlist.

Breaking for `@qa-ai-stlc/core`: `isUrlAllowed` and `assertUrlAllowed` now take a required
`baseUrl` parameter; `createBrowserSafeModeRouteHandler` and `OpenBrowserSessionOptions` /
`BrowserSession` (`baseUrl`) changed to match. Breaking for `@qa-ai-stlc/explorer`:
`createSafeModeRouteHandler`, `AnalyzePagesOptions` and `BuildSelectorRegistryOptions` now require
`baseUrl` alongside `allowlist`.
