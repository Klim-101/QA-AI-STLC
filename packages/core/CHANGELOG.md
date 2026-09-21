# @qa-ai-stlc/core

## 0.10.0

### Minor Changes

- 0679258: Add the `browser.*` MCP tools, the only way an agent may drive a browser (ADR-005):
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

### Patch Changes

- Updated dependencies [0679258]
  - @qa-ai-stlc/schemas@0.9.0

## 0.9.0

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

## 0.8.0

### Minor Changes

- 554ec6d: Add test case traceability (development plan section 2.7 step 9): a case must link to at least one requirement (`TestCaseSchema.requirementIds` now requires a non-empty array), and every link is checked against the scope artifact's actual requirement ids, not just validated for shape.

  `@qa-ai-stlc/core` gained `findUnlinkedRequirementIds`, a pure function cross-checking a case's `requirementIds` against a `Scope`.

  `@qa-ai-stlc/cli` gained `qa cases add --path <path>`: validates a test case written as JSON and registers it under `artifacts/cases/<id>.json`, rejecting it up front if any linked requirement does not exist in `artifacts/scope.json`. `qa validate` now also re-checks every already-registered case's links on every run — a link broken later by editing `scope.json` is caught here, not only at `cases add` time — and its exit code is nonzero for a reopened gate or any unlinked case.

### Patch Changes

- Updated dependencies [554ec6d]
  - @qa-ai-stlc/schemas@0.8.0

## 0.7.0

### Minor Changes

- 859a980: Add `qa scope --from file --path <path>` and `qa scope --from text --content <text> --label <label>`: deterministic, rule-based requirement extraction into `artifacts/scope.json` (the framework never fetches requirements from a tracker). A level-2 Markdown heading (`## Title`) becomes one requirement; repeated calls upsert by requirement id instead of duplicating or replacing the whole set, so a later source's content for the same requirement wins while other requirements (and any hand-edited `inScope`) are left untouched. The scope artifact is registered in `manifest.json` on every write, same as the selector registry.

  `@qa-ai-stlc/core` gained the underlying `extractRequirements` and `mergeRequirements` functions.

## 0.6.0

### Minor Changes

- 0b5fbd6: Add the v0 pipeline state machine (ADR-003): `scope` then `cases`, approved in order, each gate bound to the SHA-256 of the exact artifact content it approves.

  `@qa-ai-stlc/schemas` gained `PipelineStateSchema` (artifact kind `state`, `.qa/state.json`), `PhaseNameSchema` and `GateStatusSchema`.

  `@qa-ai-stlc/core` gained `GateStateMachine` (`approve()`/`validate()`), `ApprovalLedgerStore` (`.qa/artifacts/approval-ledger.json`, append-only), `PipelineStateStore` and the exported `PHASES` order. `validate()` always recomputes every gate's status from the ledger and each approved artifact's current content rather than trusting a cached field — editing an approved artifact reopens its gate the next time `approve()` or `validate()` runs, with no separate tamper check needed.

  `@qa-ai-stlc/cli` gained two commands: `qa approve <gate> --artifact <path> --approved-by <name> [--note <text>]` and `qa validate`. `qa validate` exits nonzero only when a gate that had a real approval no longer matches it (a reopened gate), not for a phase simply not yet approved.

### Patch Changes

- Updated dependencies [0b5fbd6]
  - @qa-ai-stlc/schemas@0.7.0

## 0.5.1

### Patch Changes

- a6629ed: Fix `qa explore --pick` launching its browser headless, so the window a human is supposed to click
  elements in never actually appeared and the command hung until pick mode's 30-minute timeout.
  `BrowserLauncher.launch()` now takes an optional `{ headless }`; pick mode passes `headless: false`,
  every other caller (crawling, scripted login) is unaffected and still launches headless.

## 0.5.0

### Minor Changes

- 524a9c8: `qa init` now runs the testing scope survey (development plan section 2.7): Web E2E, API, accessibility and security are answered independently with `--e2e`, `--api`, `--a11y` and `--security` (each `in-scope` or `out-of-scope`), plus optional `--source-path` and, when API is in scope, `--api-source`. `qa init` refuses to finish with a type left `undecided` unless `--defer-scope` is passed, so a project never silently starts with a scope nobody decided.

  Add `qa config set testing.<type> <in-scope|out-of-scope|undecided>` to change one testing type's scope decision later, preserving the rest of `config.yaml` (including comments and formatting).

  `qa doctor` gains two checks: `source-path` (is `source.path` readable) and `api-contract` (is `api.source` reachable — over HTTP for a URL, on disk for a local file; `"discover"`/`"synthesize"` are not checked, since neither is a file or a URL).

  `@qa-ai-stlc/core` exports the two new doctor checks, `checkSourcePathReadable()` and `checkApiContractReadable()`.

## 0.4.1

### Patch Changes

- Updated dependencies [143e889]
  - @qa-ai-stlc/schemas@0.6.0

## 0.4.0

### Minor Changes

- f301cb4: Add the `qa explore` command to `@qa-ai-stlc/cli`: crawls the configured environment, synthesizes and scores locator candidates, and writes `.qa/selectors/registry.json`, `.qa/selectors/missing-test-ids.json` and the generated `tests/qa/locators.ts`, registering all three in the manifest. `--static` merges in static source analysis findings when `source.path` is configured; `--pick <url>` runs a manual pick-mode session against one page instead of crawling. `--verify` re-checks every stored, non-deprecated element's primary candidate against the live page it was found on and exits non-zero when one no longer resolves as well as it did when last recorded — the signal a stale selector (for example a renamed test ID) needs.

  `@qa-ai-stlc/schemas`'s `SelectorElementSchema` gains an optional `pageUrl`, recorded by a `crawl`/`manual` entry so `qa explore --verify` knows which live page to re-check a stored element's candidates against.

  `@qa-ai-stlc/core`'s `FileSystem` port gains `listFiles()`, listing every regular file under a directory tree recursively; `qa explore --static` uses it to discover source files to scan.

### Patch Changes

- Updated dependencies [f301cb4]
  - @qa-ai-stlc/schemas@0.5.0

## 0.3.0

### Minor Changes

- 99ddeb2: Add stability scoring to `@qa-ai-stlc/explorer`: `scoreLocatorStability()` resolves one of P1-08's `LocatorCandidate`s against a live page and scores it 0..1 by verifying uniqueness now (a hard gate — a candidate resolving to anything but exactly one element scores 0), then survival across a page reload and each of a configurable set of viewport sizes (desktop/tablet/mobile by default). The original viewport is restored before returning, so scoring one element does not affect the next. `resolveCandidateLocator()` maps a candidate's strategy to the matching `AuthPage` locator method.

  `@qa-ai-stlc/core`'s `AuthPage` port gained `getByRole()`, `getByTestId()`, `getByLabel()`, `getByPlaceholder()`, `getByText()`, `locator()` (each returning a `PageLocator` with `count()`), `reload()`, `setViewportSize()` and `viewportSize()`, mirroring Playwright's own `Page`/`Locator` API exactly so `playwrightBrowserLauncher` needs no glue code.

### Patch Changes

- Updated dependencies [3bb0f18]
  - @qa-ai-stlc/schemas@0.4.0

## 0.2.1

### Patch Changes

- Updated dependencies [033e9a1]
  - @qa-ai-stlc/schemas@0.3.0

## 0.2.0

### Minor Changes

- 27866c6: Add page analysis to `@qa-ai-stlc/explorer`: `analyzePages()` builds a structured `PageModel` for each URL in a crawl's `RouteMap` — accessibility tree, interactive elements, forms, tables and dialogs — all length- and count-capped as untrusted, page-derived data. Page-state judgments (empty/loading/error) are deliberately not classified by the engine; only the structural signals an agent can interpret are captured.

  `@qa-ai-stlc/core`'s `AuthPage` port gained `ariaSnapshotJSON()`, wrapping Playwright's own accessibility snapshot.

  `@qa-ai-stlc/schemas` gained `PageModelSetSchema` (artifact kind `page-models`).

### Patch Changes

- Updated dependencies [27866c6]
  - @qa-ai-stlc/schemas@0.2.0

## 0.1.0

### Minor Changes

- 823eb39: Add `@qa-ai-stlc/explorer`, the crawler: route discovery from a start URL following only in-allowlist links, in safe mode (every non-GET request is intercepted and cancelled), producing a `RouteMap` artifact and a redactable HAR-shaped request log. Crawling can sign in first through an optional identity, reusing `authenticate()`.

  `@qa-ai-stlc/core`'s `AuthPage`/`AuthBrowser` ports gained `route()`, `evaluate()`, a typed `goto()` response, and `newContext(options)` to replay a captured session — needed by the crawler and available to any other consumer.

  `@qa-ai-stlc/schemas` gained `RouteMapSchema` (artifact kind `route-map`), the crawler's own output artifact.

### Patch Changes

- Updated dependencies [823eb39]
  - @qa-ai-stlc/schemas@0.1.0
