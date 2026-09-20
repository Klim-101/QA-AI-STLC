# @qa-ai-stlc/explorer

## 0.6.5

### Patch Changes

- Updated dependencies [554ec6d]
  - @qa-ai-stlc/schemas@0.8.0
  - @qa-ai-stlc/core@0.8.0

## 0.6.4

### Patch Changes

- Updated dependencies [859a980]
  - @qa-ai-stlc/core@0.7.0

## 0.6.3

### Patch Changes

- Updated dependencies [0b5fbd6]
  - @qa-ai-stlc/schemas@0.7.0
  - @qa-ai-stlc/core@0.6.0

## 0.6.2

### Patch Changes

- Updated dependencies [a6629ed]
  - @qa-ai-stlc/core@0.5.1

## 0.6.1

### Patch Changes

- Updated dependencies [524a9c8]
  - @qa-ai-stlc/core@0.5.0

## 0.6.0

### Minor Changes

- 143e889: Add static route extraction to `@qa-ai-stlc/explorer`: `analyzeStaticRoutes()` extracts client-side route declarations from source — React Router's `<Route path="...">` JSX, and Vue Router's/Angular's `path: '...'` route-config objects under a `routes` array — with file and line locations, using the same lightweight lexical scan `analyzeStaticSource()` already uses rather than a per-framework AST parser. `mergeStaticRoutes()` merges the findings into a crawler-produced `RouteMap`, resolving each path against the map's own `startUrl` origin and skipping a route the crawler already found.

  `@qa-ai-stlc/schemas`'s `RouteDiscoveryMethodSchema` gains a `'static'` value, and `DiscoveredRouteSchema` gains an optional `sourceLocation` (the file and line a static route was found at, since there is no live navigation to point at instead).

### Patch Changes

- Updated dependencies [143e889]
  - @qa-ai-stlc/schemas@0.6.0
  - @qa-ai-stlc/core@0.4.1

## 0.5.1

### Patch Changes

- f301cb4: Add the `qa explore` command to `@qa-ai-stlc/cli`: crawls the configured environment, synthesizes and scores locator candidates, and writes `.qa/selectors/registry.json`, `.qa/selectors/missing-test-ids.json` and the generated `tests/qa/locators.ts`, registering all three in the manifest. `--static` merges in static source analysis findings when `source.path` is configured; `--pick <url>` runs a manual pick-mode session against one page instead of crawling. `--verify` re-checks every stored, non-deprecated element's primary candidate against the live page it was found on and exits non-zero when one no longer resolves as well as it did when last recorded — the signal a stale selector (for example a renamed test ID) needs.

  `@qa-ai-stlc/schemas`'s `SelectorElementSchema` gains an optional `pageUrl`, recorded by a `crawl`/`manual` entry so `qa explore --verify` knows which live page to re-check a stored element's candidates against.

  `@qa-ai-stlc/core`'s `FileSystem` port gains `listFiles()`, listing every regular file under a directory tree recursively; `qa explore --static` uses it to discover source files to scan.

- Updated dependencies [f301cb4]
  - @qa-ai-stlc/core@0.4.0
  - @qa-ai-stlc/schemas@0.5.0

## 0.5.0

### Minor Changes

- aa0b59d: Add manual pick mode to `@qa-ai-stlc/explorer`: `injectPickModeOverlay()` opens a headed-browser overlay a human clicks through to capture interactive elements, `waitForPickModeCompletion()` collects every capture once the human confirms they are done, `capturePickModeElements()` synthesizes and scores locator candidates for each one against the live page, and `finalizeManualSelectorEntries()` turns confirmed names into `source: 'manual'` registry entries. A manually-picked element gets the same `elementId` a crawl would assign it, so a page later crawled does not duplicate a pick-mode entry. Every click is intercepted before it reaches the application (safe mode), so pick mode never submits a form or triggers a real navigation.

## 0.4.0

### Minor Changes

- 3bb0f18: Add the selector registry to `@qa-ai-stlc/explorer`: `buildSelectorRegistry()` assembles a `SelectorRegistry` from a `PageModelSet`, synthesizing locator candidates for every interactive element and scoring the primary candidate's stability in a fresh live pass over the same URLs. Each element gets a stable `elementId` derived from its page, kind and best available name, so it survives a DOM reorder across two crawls. `mergeSelectorRegistry()` keeps history on re-crawl: an element the fresh crawl no longer finds is kept, not deleted, with `deprecatedAt` stamped the first time it goes missing. `diffSelectorRegistry()` reports elements added, removed or degraded (a lower stability score) between two crawls.

  `@qa-ai-stlc/schemas`'s `SelectorElementSchema` now allows an empty `locatorCandidates` array: the `strict-no-css` synthesis policy can legitimately find no candidate at all for an element with no role, test ID, label, placeholder or text signal, and the element is still recorded (with `stabilityScore: 0`) instead of being silently dropped.

- 99ddeb2: Add stability scoring to `@qa-ai-stlc/explorer`: `scoreLocatorStability()` resolves one of P1-08's `LocatorCandidate`s against a live page and scores it 0..1 by verifying uniqueness now (a hard gate — a candidate resolving to anything but exactly one element scores 0), then survival across a page reload and each of a configurable set of viewport sizes (desktop/tablet/mobile by default). The original viewport is restored before returning, so scoring one element does not affect the next. `resolveCandidateLocator()` maps a candidate's strategy to the matching `AuthPage` locator method.

  `@qa-ai-stlc/core`'s `AuthPage` port gained `getByRole()`, `getByTestId()`, `getByLabel()`, `getByPlaceholder()`, `getByText()`, `locator()` (each returning a `PageLocator` with `count()`), `reload()`, `setViewportSize()` and `viewportSize()`, mirroring Playwright's own `Page`/`Locator` API exactly so `playwrightBrowserLauncher` needs no glue code.

### Patch Changes

- Updated dependencies [3bb0f18]
- Updated dependencies [99ddeb2]
  - @qa-ai-stlc/schemas@0.4.0
  - @qa-ai-stlc/core@0.3.0

## 0.3.0

### Minor Changes

- 033e9a1: Add locator synthesis to `@qa-ai-stlc/explorer`: `synthesizeLocatorCandidates()` builds an ordered `LocatorCandidate[]` for an interactive element under three policies — `playwright-default` (role, testId, label, placeholder, text, CSS last), `testid-first`, and `strict-no-css` (never emits the CSS fallback). CSS candidates are always flagged `fragile: true` and built from a captured tag name and sibling position, so an element with no accessible role, label, placeholder or text still gets a candidate.

  `@qa-ai-stlc/schemas`'s `InteractiveElement` gained the raw attributes locator synthesis needs (`role`, `label`, `placeholder`, `htmlId`, `tagName`, `nthOfType`), captured by the same page-element extraction added in P1-07 and subject to the same untrusted-data length caps.

### Patch Changes

- Updated dependencies [033e9a1]
  - @qa-ai-stlc/schemas@0.3.0
  - @qa-ai-stlc/core@0.2.1

## 0.2.0

### Minor Changes

- 27866c6: Add page analysis to `@qa-ai-stlc/explorer`: `analyzePages()` builds a structured `PageModel` for each URL in a crawl's `RouteMap` — accessibility tree, interactive elements, forms, tables and dialogs — all length- and count-capped as untrusted, page-derived data. Page-state judgments (empty/loading/error) are deliberately not classified by the engine; only the structural signals an agent can interpret are captured.

  `@qa-ai-stlc/core`'s `AuthPage` port gained `ariaSnapshotJSON()`, wrapping Playwright's own accessibility snapshot.

  `@qa-ai-stlc/schemas` gained `PageModelSetSchema` (artifact kind `page-models`).

### Patch Changes

- Updated dependencies [27866c6]
  - @qa-ai-stlc/core@0.2.0
  - @qa-ai-stlc/schemas@0.2.0

## 0.1.0

### Minor Changes

- 823eb39: Add `@qa-ai-stlc/explorer`, the crawler: route discovery from a start URL following only in-allowlist links, in safe mode (every non-GET request is intercepted and cancelled), producing a `RouteMap` artifact and a redactable HAR-shaped request log. Crawling can sign in first through an optional identity, reusing `authenticate()`.

  `@qa-ai-stlc/core`'s `AuthPage`/`AuthBrowser` ports gained `route()`, `evaluate()`, a typed `goto()` response, and `newContext(options)` to replay a captured session — needed by the crawler and available to any other consumer.

  `@qa-ai-stlc/schemas` gained `RouteMapSchema` (artifact kind `route-map`), the crawler's own output artifact.

### Patch Changes

- Updated dependencies [823eb39]
  - @qa-ai-stlc/core@0.1.0
  - @qa-ai-stlc/schemas@0.1.0
