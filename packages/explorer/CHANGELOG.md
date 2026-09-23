# @qa-ai-stlc/explorer

## 1.0.1

### Patch Changes

- 3590f7a: Fixes a silent failure mode found during a manual end-to-end eval (#329): `environments.<name>.allowlist`
  entries were validated only as non-empty strings, so a plausible-looking but wrong value (a port or
  scheme, e.g. `"localhost:4310"` instead of `"localhost"`) passed `qa config add environment` and
  `config.yaml` validation, then made every `qa explore` crawl navigation fail the allowlist check —
  since the check compares against `URL.hostname`, which is always port-stripped — with 0 elements and
  no diagnostic, indistinguishable from "the app has nothing." `EnvironmentConfigSchema.allowlist`
  (`packages/schemas`) now rejects an entry containing a scheme, port or path with a clear error
  message. `qa explore` (`packages/explorer`) also now warns with a coded `EXPLORE_START_URL_NOT_ALLOWED`
  message whenever a crawl visits 0 pages because the environment's own `baseUrl` fails its allowlist.
- Updated dependencies [3590f7a]
- Updated dependencies [af2f3da]
  - @qa-ai-stlc/schemas@1.0.1
  - @qa-ai-stlc/core@1.0.1

## 1.0.0

### Major Changes

- 81bf690: Fix `computeElementId` prioritizing locator-quality signals (`accessibleName`, `label`) over
  `testId` when computing an element's identity, and having no disambiguator for two distinct
  elements that share the same signal on one page. `accessibleName`/`label` can legitimately change
  with live page content (a "Cart (3)" button's accessible name changes the moment the badge count
  does), so an element whose `data-testid` never changed was still getting a new `elementId` on
  every crawl where that text differed — breaking continuity for anything keyed by `elementId`
  across crawls (degraded-selector tracking, evidence links). Two elements sharing the same name on
  one page (e.g. two "Delete" buttons in a list) also collided outright, since the position-based
  fallback was only ever used when every named signal was absent, never as a tiebreaker.

  `computeElementId` now prefers `testId` first, and `createElementIdAssigner()` tracks an
  occurrence index per `(url, kind, signal)` across one crawl or pick-mode batch so same-signal
  duplicates never collide.

  Breaking: stored `elementId` values change on the next `qa explore` run for elements whose
  identity depended on `accessibleName`/`label` ranking above `testId` — expect every such element
  to show up once as "removed" and once as "added" in that run's diff, not as a behavior change to
  review, since the elements themselves have not changed.

### Minor Changes

- 17d5441: Environments can now opt in to reaching a server behind a self-signed or internal-CA TLS
  certificate (P2-18): `environments.<name>.tlsInsecure: true` in `config.yaml` (`EnvironmentConfigSchema`,
  `packages/schemas`) bypasses certificate validation for that environment's `qa doctor` reachability
  check and every `qa explore`/`qa.browser_open` browser session, including scripted login. Off by
  default — an environment without it behaves exactly as before, rejecting an untrusted certificate.
  Enabling it prints a coded warning (`ENVIRONMENT_TLS_INSECURE`) on every run that uses it, since it
  weakens a real security guarantee.
- c7a5c3d: Fix stability scoring discarding its own result and reloading the page once per element.
  `buildSelectorRegistry` scored only the policy-picked primary candidate and then ignored the
  score when choosing which candidate to keep, so a lower-priority candidate that would have scored
  more stable than the policy-preferred one was never surfaced or used. Scoring also reloaded the
  page and resized the viewport once per interactive element — 200 reloads to score one 200-element
  page.

  `scorePageCandidates` (new) batches every check (unique now, survives one shared reload, survives
  each shared viewport resize) across every candidate of every element on a page in a single pass,
  scoring every synthesized candidate rather than only the primary. `buildSelectorRegistry` now
  promotes whichever candidate actually scored highest to `locatorCandidates[0]` instead of trusting
  policy order alone.

  Not breaking: `scoreLocatorStability` (single-candidate scoring, used by `qa explore --verify`) is
  unchanged. Expect `qa explore`'s registry diff to show more `degraded`/reordered entries on the
  next run for pages where a non-primary candidate now proves more stable than the policy-picked
  one — a more accurate result, not a regression.

### Patch Changes

- 185e50e: Fix `isUrlAllowed`/`assertUrlAllowed` (`@qa-ai-stlc/core`) only ever comparing a URL's hostname
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

- 6d8ac0a: Fix `qa explore` (crawl, static-analysis build pass, and `--verify`) never enforcing the domain
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

- 1f205dd: Fix `pii`/`dynamicText` on a selector registry element being required booleans that every
  producer (crawl, static analysis, pick mode) hardcoded to `false`, with no detection logic
  anywhere in the repo. A required `false` read as "checked, and clean" — a claim nothing had
  verified (AGENTS.md 12.5, honest statuses).

  `SelectorElementSchema` now makes both fields optional; every producer omits them instead of
  asserting `false`, so a consumer can tell "not yet evaluated" from an actual check that found
  nothing. Not breaking: an existing registry with `pii: false`/`dynamicText: false` still validates
  unchanged, and no consumer branches on either field today.

- 6c1ba4f: Fix static source analysis truncating a tag at the first `>` it finds, including one inside a
  quoted attribute value or inside a `{...}` JSX/Vue/Angular expression container. An inline arrow
  handler (`onClick={() => save()}`), one of the most common idioms in real frontend code, contains
  a `>` well before the tag's real end, so any `data-testid`/`aria-label`/`role` written after it in
  the same tag was never seen — the element was reported as missing a test id it actually has. The
  scan now tracks quote and brace state instead of doing a bare `indexOf('>')`.
- 22d0436: Fix `analyzeStaticSource` silently discarding every finding past a tag whose quote or `{...}`
  brace tracking never balances before the end of the file: `#281`'s `findTagEnd` returns `-1` in
  that case, and the caller treated `-1` the same as "no more tags in the file," aborting the whole
  scan. A single confusing construct anywhere in a file (an apostrophe inside a regex literal, an
  unbalanced brace inside a template literal) could silently drop a large fraction of a "missing
  test ID" report with no error or warning.

  `findStaticElements` now resumes scanning right after the unclosed `<` instead of aborting the
  file, treating it as literal text — the same accepted false-positive/false-negative risk the
  scanner already documents, not a new failure mode that cascades across the rest of the file.

- e1f1308: Fix `qa explore --verify` navigating with no safe-mode route handler installed at all, unlike
  every other operation that drives a browser, and unconditionally reporting `blockedRequestCount: 0`
  in its report regardless of what actually happened. `--verify` now installs the same route handler
  `qa explore`'s registry build uses and reports the real count of non-GET requests it blocked.
- Updated dependencies [bcad827]
- Updated dependencies [17d5441]
- Updated dependencies [8c8971b]
- Updated dependencies [185e50e]
- Updated dependencies [adaa974]
- Updated dependencies [bb0a0aa]
- Updated dependencies [e288603]
- Updated dependencies [2334df3]
- Updated dependencies [2235987]
- Updated dependencies [c1f4de6]
- Updated dependencies [e968493]
- Updated dependencies [1f205dd]
- Updated dependencies [d1b29ee]
- Updated dependencies [71bbbf7]
- Updated dependencies [f44a75b]
  - @qa-ai-stlc/schemas@1.0.0
  - @qa-ai-stlc/core@1.0.0

## 0.7.2

### Patch Changes

- Updated dependencies [0e329ac]
  - @qa-ai-stlc/core@0.11.0

## 0.7.1

### Patch Changes

- Updated dependencies [0679258]
  - @qa-ai-stlc/schemas@0.9.0
  - @qa-ai-stlc/core@0.10.0

## 0.7.0

### Minor Changes

- 65d8538: Add MCP tools for every engine operation the CLI already exposes: `qa.doctor`, `qa.explore`,
  `qa.scope`, `qa.cases_add`, `qa.approve` and `qa.validate`. Each tool calls the exact same
  underlying operation its CLI command calls — `runDoctor`, `runScope`, `runCasesAdd`, `runApprove`
  and `runValidate` moved from `@qa-ai-stlc/cli` into `@qa-ai-stlc/core` as reusable, `EngineContext`-driven
  functions, and `runExplore`'s crawl/static-analysis/`--verify` logic moved into `@qa-ai-stlc/explorer`
  for the same reason — so the CLI and the MCP server share one implementation instead of two. `qa
explore`'s manual pick-mode capture (`--pick <url>`) stays CLI-only: it opens a headed browser for
  a human to click through, which an agent cannot drive over MCP's stdio transport. `report` has no
  CLI command yet, so it has no MCP tool yet either.

  `@qa-ai-stlc/core` gains a public `EngineContext` interface (`CommandContext` minus the CLI's own
  `io`/`json` concerns) that both the CLI and the MCP server build their own adapters into.

### Patch Changes

- Updated dependencies [65d8538]
  - @qa-ai-stlc/core@0.9.0

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
