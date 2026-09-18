# @qa-ai-stlc/schemas

## 0.5.0

### Minor Changes

- f301cb4: Add the `qa explore` command to `@qa-ai-stlc/cli`: crawls the configured environment, synthesizes and scores locator candidates, and writes `.qa/selectors/registry.json`, `.qa/selectors/missing-test-ids.json` and the generated `tests/qa/locators.ts`, registering all three in the manifest. `--static` merges in static source analysis findings when `source.path` is configured; `--pick <url>` runs a manual pick-mode session against one page instead of crawling. `--verify` re-checks every stored, non-deprecated element's primary candidate against the live page it was found on and exits non-zero when one no longer resolves as well as it did when last recorded — the signal a stale selector (for example a renamed test ID) needs.

  `@qa-ai-stlc/schemas`'s `SelectorElementSchema` gains an optional `pageUrl`, recorded by a `crawl`/`manual` entry so `qa explore --verify` knows which live page to re-check a stored element's candidates against.

  `@qa-ai-stlc/core`'s `FileSystem` port gains `listFiles()`, listing every regular file under a directory tree recursively; `qa explore --static` uses it to discover source files to scan.

## 0.4.0

### Minor Changes

- 3bb0f18: Add the selector registry to `@qa-ai-stlc/explorer`: `buildSelectorRegistry()` assembles a `SelectorRegistry` from a `PageModelSet`, synthesizing locator candidates for every interactive element and scoring the primary candidate's stability in a fresh live pass over the same URLs. Each element gets a stable `elementId` derived from its page, kind and best available name, so it survives a DOM reorder across two crawls. `mergeSelectorRegistry()` keeps history on re-crawl: an element the fresh crawl no longer finds is kept, not deleted, with `deprecatedAt` stamped the first time it goes missing. `diffSelectorRegistry()` reports elements added, removed or degraded (a lower stability score) between two crawls.

  `@qa-ai-stlc/schemas`'s `SelectorElementSchema` now allows an empty `locatorCandidates` array: the `strict-no-css` synthesis policy can legitimately find no candidate at all for an element with no role, test ID, label, placeholder or text signal, and the element is still recorded (with `stabilityScore: 0`) instead of being silently dropped.

## 0.3.0

### Minor Changes

- 033e9a1: Add locator synthesis to `@qa-ai-stlc/explorer`: `synthesizeLocatorCandidates()` builds an ordered `LocatorCandidate[]` for an interactive element under three policies — `playwright-default` (role, testId, label, placeholder, text, CSS last), `testid-first`, and `strict-no-css` (never emits the CSS fallback). CSS candidates are always flagged `fragile: true` and built from a captured tag name and sibling position, so an element with no accessible role, label, placeholder or text still gets a candidate.

  `@qa-ai-stlc/schemas`'s `InteractiveElement` gained the raw attributes locator synthesis needs (`role`, `label`, `placeholder`, `htmlId`, `tagName`, `nthOfType`), captured by the same page-element extraction added in P1-07 and subject to the same untrusted-data length caps.

## 0.2.0

### Minor Changes

- 27866c6: Add page analysis to `@qa-ai-stlc/explorer`: `analyzePages()` builds a structured `PageModel` for each URL in a crawl's `RouteMap` — accessibility tree, interactive elements, forms, tables and dialogs — all length- and count-capped as untrusted, page-derived data. Page-state judgments (empty/loading/error) are deliberately not classified by the engine; only the structural signals an agent can interpret are captured.

  `@qa-ai-stlc/core`'s `AuthPage` port gained `ariaSnapshotJSON()`, wrapping Playwright's own accessibility snapshot.

  `@qa-ai-stlc/schemas` gained `PageModelSetSchema` (artifact kind `page-models`).

## 0.1.0

### Minor Changes

- 823eb39: Add `@qa-ai-stlc/explorer`, the crawler: route discovery from a start URL following only in-allowlist links, in safe mode (every non-GET request is intercepted and cancelled), producing a `RouteMap` artifact and a redactable HAR-shaped request log. Crawling can sign in first through an optional identity, reusing `authenticate()`.

  `@qa-ai-stlc/core`'s `AuthPage`/`AuthBrowser` ports gained `route()`, `evaluate()`, a typed `goto()` response, and `newContext(options)` to replay a captured session — needed by the crawler and available to any other consumer.

  `@qa-ai-stlc/schemas` gained `RouteMapSchema` (artifact kind `route-map`), the crawler's own output artifact.
