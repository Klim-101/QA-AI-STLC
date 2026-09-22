---
'@qa-ai-stlc/explorer': patch
---

Fix `qa explore` (crawl, static-analysis build pass, and `--verify`) never enforcing the domain
allowlist inside its own safe-mode route handler: `#279` fixed this for a live
`qa.browser_navigate`/`qa.browser_open` session in `@qa-ai-stlc/core`, but
`packages/explorer/src/safe-mode.ts` was a separate, independent implementation that only checked
the HTTP method, not the URL. `crawl()`'s own link-following already filtered which links it
queued, but the route handler saw every request the page actually made — a redirect or an
in-page-triggered navigation off the allowlist reached the network with nothing to catch it, and
`qa explore --verify` (fixed by `#280` to install this handler at all, but not to make it
allowlist-aware) had the same gap.

`createSafeModeRouteHandler` now takes the session's allowlist and blocks a GET off it the same
way `@qa-ai-stlc/core`'s browser session handler does, reusing its `isUrlAllowed` check instead of
duplicating the logic. `crawl()`, `analyzePages()`, `buildSelectorRegistry()` and `qa explore
--verify` all pass the environment's configured allowlist through.
