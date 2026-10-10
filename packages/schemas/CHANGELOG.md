# @qa-ai-stlc/schemas

## 1.6.1

No changes in this release.

## 1.6.0

### Minor Changes

- 32bdb52: Add an `a11y` config block: WCAG version (`2.0`, `2.1` or `2.2`, default `2.1`), cumulative conformance level (`A`, `AA` or `AAA`, default `AA`), best-practice rules (default off), include and exclude selectors, and known-issue exceptions with a rule id, a reason and an optional expiry. `qa init` (`--a11y-wcag-version`, `--a11y-level`, `--a11y-best-practices`) and `qa.init` (`a11y`) record the target when accessibility testing is in scope, and the `qa-start` skill asks for it.
- dfafb00: Add a per-criterion accessibility conformance section to `qa report` and `qa.report`, built from the recorded axe-core scans, and record the passed and inapplicable rules in the scan evidence.
- d6dfc44: Add the `apiAuth` configuration section: named API authentication profiles whose secrets are `QA_*` variable names, with an optional default profile per environment.
- c3967a9: Add `qa api-diff` (MCP `qa.api_diff`): compares the OpenAPI 3.x contract named by `api.source` (a project file, an allowlisted URL, or `discover`, which probes the well-known spec paths with GET requests only) with the endpoints the last `qa explore` observed, and writes `selectors/api-diff.json` with each discrepancy classified as matched, undocumented, method not documented or unobserved, stamped with the contract's SHA-256. Path parameter names are ignored when comparing, so `/tasks/{taskId}` matches the observed `/tasks/{id}`.
- f664f1c: Generate API specs through the verification loop. For an `api` case, `qa.generation_spoke_input` returns `apiContract` (the contract operations the case names, plus the contract SHA-256) instead of a registry slice and locator module, and `qa.generation_verify` runs the spec through `runner-api`. A generated API spec must declare `export const CONTRACT_SHA256 = "<hash>"`: verification rejects a spec that does not match the input's hash, and `runner-api` rejects a spec once the live contract hashes differently (`API_SPEC_CONTRACT_CHANGED`). `registrySlice` and `locatorModule` are now optional in the spoke input schema and required only for non-`api` cases. The `qa-generate-tests` skill documents the API flow.
- 2e4885c: Add `qa.browser_attach`: attach to a Chrome the operator started with `--remote-debugging-port` and already signed into, as a browser session the `qa.browser_*` tools and `from-browser` API auth profiles can use. Only loopback endpoints are accepted, safe mode and the allowlist apply to the driven page only, and closing the session disconnects without closing the operator's browser.
- e0a6192: A browser session now handles JavaScript dialogs and the pages the application opens. `alert`, `confirm` and `prompt` are dismissed by default (`qa.browser_open` takes `dialogPolicy: 'accept'` to accept them instead); each is recorded as a `dialog` evidence record and reported in `notices` in the result of the next click, key press, checkbox change, navigation or snapshot. A page a link or script opens joins the session as a tab and `qa.browser_tabs` lists the tabs and switches the active page, which retires the snapshot refs of the page it leaves. A page that opens off the domain allowlist is closed by the engine and reported as `tab-blocked`. Safe mode and the allowlist are now installed on the browser context instead of the first page, so they cover a popup's first request too.
- c649f7d: `qa.browser_expect` checks one expected result in the page: an element visible or hidden, its text, its value, how many elements match, a checkbox state, or the page URL. It looks again until the expectation holds or the wait runs out (never longer than the environment action timeout), and registers an `expect` evidence record with what the page showed and the engine's `passed` verdict. A failed expectation is returned with the observed value rather than thrown; a malformed one is `BROWSER_EXPECT_INVALID`. A check that reads one element fails if the selector matches several, and the value of a password field is recorded as `[redacted]`. The evidence action type gains `expect` and an optional `expectation` field.
- 2338a38: `qa.browser_press` presses a key or chord on an element or on the page, `qa.browser_hover` moves the pointer over an element, and `qa.browser_check` sets a checkbox or radio to a state and reads it back; each registers an action evidence record. Safe mode still blocks any non-GET request a key press sets off. A lone character pressed is recorded as `[character]`, and a box the page leaves in another state is `BROWSER_CHECK_NOT_APPLIED` and registers nothing. The evidence action type gains `press`, `hover` and `check` with optional `key` and `checked` fields.
- cc53150: `qa.browser_upload` sets files on a file input from project-relative paths and registers an `upload` evidence record with the name, size and SHA-256 of each file, never its content or its project path. Paths are refused with `BROWSER_UPLOAD_PATH_INVALID` when they leave the project (including through a symbolic link) or sit under `.qa/` or `.git/`, a missing file is `BROWSER_UPLOAD_FILE_MISSING`, a file that matches a secret pattern is `BROWSER_UPLOAD_SECRET`, and a file over 10 MB is `BROWSER_UPLOAD_TOO_LARGE`. Each file is read once, and those exact bytes are scanned, hashed and sent; the input is read back and a page that does not hold the files is `BROWSER_UPLOAD_NOT_APPLIED`. The `FileSystem` port gains `realPath`.
- 35d621d: `qa.browser_wait_for` waits for an element to be visible, hidden, attached or detached, for text to appear or disappear (on the page or inside one element), or for the URL to match, and registers a `wait-for` evidence record with what it waited for and how long it took. It never waits longer than the environment action timeout; a condition that never holds is `BROWSER_WAIT_TIMEOUT` naming it and registers nothing, and a malformed call is `BROWSER_WAIT_INVALID`. Looking at an element that vanishes between being counted and being read now reports it as gone instead of waiting out the action timeout, which also applies to `qa.browser_expect`.
- 770cc78: Engine browser actions now wait for busy indicators to clear. `qa.browser_click` and `qa.browser_fill` wait before and after the action, and `qa.browser_navigate` waits once the page has loaded. The indicators are the selected component library's own (a loading mask) plus the project's `ui.busySelectors`, and the wait is bounded by the environment's action timeout. An indicator that never clears fails with the coded error `BROWSER_BUSY_TIMEOUT` instead of a lost click.
- 953c27d: Add the component-library profile mechanism to the explorer. A profile selected by `ui.componentLibrary` is data: widget recognizers (a DOM signature, the widget kind and ARIA role, and the hidden native controls that only back the widget), generated-id patterns that locator synthesis rejects, and busy indicators the explorer waits out before reading a page. A recognized widget is registered on its visible wrapper as one element, with its widget kind, library and the popup it opens (read from `aria-controls`/`aria-owns`, since the popup is usually attached to `body`). No library profile ships yet; the Kendo profiles follow.
- cd183b0: Component library widgets can be driven at the widget level. The new tools `qa.browser_select_option` (an option by its visible text), `qa.browser_set_date`, `qa.browser_open_popup` and `qa.browser_close_popup` find the widget wrapper from the registry's selector, act, and check the widget's resulting state before registering the action as evidence; a widget that does not take the value fails with `BROWSER_WIDGET_VALUE_MISMATCH`, a list without the option with `BROWSER_WIDGET_OPTION_NOT_FOUND`, and a popup that does not follow with `BROWSER_WIDGET_POPUP_STATE`. The Kendo UI for jQuery and Angular profiles declare which of their widgets support which actions, and the generated `tests/qa/locators.ts` gains a matching helper per widget (`<name>SelectOption`, `<name>SetDate`, `<name>OpenPopup`, `<name>ClosePopup`) so a generated spec calls it instead of a click sequence. The evidence action types gain `select-option`, `set-date`, `open-popup` and `close-popup`.
- b5ee556: The browser action tools (`qa.browser_click`, `qa.browser_fill`, `qa.browser_select_option`, `qa.browser_set_date`, the popup tools and the grid tools) accept `ref` from the session's latest `qa.browser_snapshot` in place of `selector`; exactly one of the two is required (`BROWSER_TARGET_INVALID` otherwise). The engine resolves a ref to a role and exact-name selector, records that selector and the ref's role and name in the action evidence, and acts on the selector. A ref from an earlier snapshot, a ref used after a navigation or once the page URL changed, and a ref whose role and name no longer match exactly one element all fail with `BROWSER_REF_STALE`. Refs are numbered across the whole session, so one from an older snapshot is never mistaken for a new element. Action evidence gains an optional `ref` field.
- c7d5747: Data grids can be searched by content. `qa.browser_grid_find_row` finds the row with a given value under a column header and reads its cells; `qa.browser_grid_read_cell` returns one cell of that row. A grid with a pager is searched page by page (rewinding to its first page first), and a virtualized grid by scrolling it from the top, bounded by `maxSteps`. A value held by more than one rendered row is refused as `BROWSER_GRID_ROW_AMBIGUOUS` rather than guessed, a missing row is `BROWSER_GRID_ROW_NOT_FOUND`, and a missing header is `BROWSER_GRID_COLUMN_NOT_FOUND`. The Kendo UI for jQuery and Angular profiles declare their pager buttons and scroll container, and the evidence action types gain `grid-find-row` and `grid-read-cell`.
- ed23378: Add the `qa-rca` skill and its spoke contract. `qa.rca_input` (new) builds the input a root cause analysis is written from — the accepted defect, the cases covering its requirements, their run history, the defect's evidence (hash, size and a bounded excerpt of text evidence between untrusted-data markers) and the configured source location — from registered artifacts only, refusing evidence changed since registration. `RcaSchema` gains `evidencePaths` for the evidence the facts rest on, and `qa.rca_add` rejects any path the engine did not register (`RCA_EVIDENCE_UNREGISTERED`). The RCA Markdown lists its evidence.
- 87e1cca: Add the root cause analysis artifact and its review gate. `qa rca add --path <path>` (MCP `qa.rca_add`) registers an RCA under `artifacts/rca/<defect-id>.json` only for an accepted defect (`RCA_DEFECT_NOT_ACCEPTED` otherwise) and stamps the defect's hash on it (`defectSha256`, new optional field on `RcaSchema`); `qa rca approve <defect-id> --approved-by <name>` (MCP `qa.rca_approve`) records a review approval bound to the RCA's exact content. An approved RCA reads back as `draft` once the defect it explains changes. The RCA renders to Markdown with facts kept apart from hypotheses.
- 210e92b: Add `@qa-ai-stlc/runner-api` and route `qa run --test-type api` (MCP `qa.run`) through it. Before any spec runs it loads the OpenAPI 3.x contract named by `api.source` and checks every case the spec declares: the case must be an `api` case listing the contract operations it exercises in the new optional `endpoints` field, and every one must exist in the contract, otherwise the run is rejected with `API_CASE_NOT_IN_CONTRACT` before a request is sent. The contract text is stored as `artifacts/api-contract.txt` and registered in the manifest. Contract loading and OpenAPI parsing move from the explorer into `@qa-ai-stlc/core` (`loadApiContract`), and contract URLs and discovery probes are now checked against the environment's scheme and port as well as its hostname.
- bea8a20: Add `safeNonGetRequests` to an environment (ADR-0014): named `POST` requests (exact path, written reason) that safe mode lets through in every safe-mode session, so an application that opens its session with a POST can be explored. `qa explore` and `qa.browser_close` list what was let through and what was blocked, by method and path; an entry only a local config layer adds is reported as a relaxation; `qa config add environment` takes `--allow-request` and `--allow-request-reason`, and no MCP tool can set the list.
- 29c8fdb: Add a `ui.componentLibrary` config setting (`none`, `kendo-jquery` or `kendo-angular`, default `none`). `qa init --component-library` and `qa.init` (`componentLibrary`) record the answer, the `qa-start` skill asks for it, and `qa config set ui.componentLibrary <value>` and `qa.config_set` change it later.

## 1.5.0

### Minor Changes

- 1e2ab70: Move six project-specific engine constants into config (P6-23), each defaulting to its former hardcoded value so behavior does not change without config:

  - `selectors.stabilityViewports` — the viewports a locator candidate is scored at (was: desktop/tablet/mobile, unconditionally).
  - `selectors.defaultLoginSelectors` — the generic login-form selectors used when an identity's own `selectors` names none.
  - `selectors.extraStableAttributes` — attributes, beyond `testIdAttribute`, synthesized as an extra CSS candidate when an element carries one.
  - `selectors.generatedIdPatterns` — regular expressions an `id` is checked against before it is used as a CSS fallback candidate, so a framework-generated id (React's `useId`, a CSS-module hash) is never picked.
  - `environments.<name>.navigationTimeoutMs` / `actionTimeoutMs` — Playwright's navigation and action timeouts for `qa.browser_navigate`/`_click`/`_fill`, per ADR-011 a field of the environment rather than a generic overrides block.
  - `evidence.httpBodyPreviewMaxLength` — the cap on a stored HTTP response-body preview (`qa.http_execute`), was a hardcoded 4000.

  `navigationTimeoutMs`/`actionTimeoutMs` apply to the interactive `qa.browser_*` session only; explorer's own crawl, analysis and registry-build navigation, and scripted login, are unchanged and still use Playwright's default. `extraStableAttributes` is not available during manual pick mode, which has no live DOM read for an arbitrary attribute.

- 434e07f: Load the configuration in two layers (ADR-011): `.qa/config.yaml` plus an optional, git-ignored `.qa/config.local.yaml`, or the file named by `QA_CONFIG_LOCAL`. The local layer may set only `environments`, `identities`, `source` and `agents`; objects merge key by key and arrays and scalars replace. Validation errors name the file each bad value came from. Every CLI command except `init` prints a `CONFIG_RELAXATION` warning to stderr for each allowlist entry or `tlsInsecure: true` that the local layer adds. `qa init` adds `/config.local.yaml` to `.qa/.gitignore`, including in existing projects.
- a9488cb: `qa explore` / `qa.explore` now derives a discovered API surface from the crawl's own traffic and
  writes it to `.qa/selectors/endpoints.json`, merging with anything already stored there: every
  request is redacted, then collapsed onto a templated path (`/tasks/8213`, `/tasks/t-1` →
  `/tasks/{id}`) with a capped sample of the raw paths it was collapsed from. `qa.explore`'s result
  gains `endpointsPath` and `endpointCount`. `ApiEndpointSchema` (`@qa-ai-stlc/schemas`) gains an
  optional `examples` field to hold that sample.

### Patch Changes

- 21e7319: `qa.generation_register` no longer trusts a verification outcome supplied by the caller. `qa.generation_verify` now records every outcome as an engine-written, manifest-registered verification record under `.qa/verifications/` and returns its `verificationId`; `qa.generation_register` takes the `spec` and that `verificationId` instead of `result` and `contentSha256`. Registration is rejected with a coded error when no such record exists, the record was edited, it did not end `verified`, it was already used, or the spec's test case, file path or content differ from what was verified. Verification also requires the test case to be registered and unchanged. `qa init` adds `/verifications/` to `.qa/.gitignore`.

## 1.4.0

No changes in this release.

## 1.3.0

### Minor Changes

- efb7692: Flags a test case as flaky when its run history flips status within a configurable window
  (`flaky.historyWindow` / `flaky.minStatusChanges` in `config.yaml`). The traceability matrix
  (`qa report`) now shows a `Flaky` column per case, computed from every recorded run under
  `.qa/runs`, not a fixed pass-rate formula — a case that always fails is never flagged flaky.

## 1.1.0

### Minor Changes

- 8ec2ace: Fixes a gap in the `cases` gate (#357): approving it used to hash-bind to any single registered
  file under `artifacts/cases/`, so approving the case set against one case never reopened when a
  different case was added or edited afterward — `qa validate` kept reporting `cases: satisfied`.

  - New `CasesIndexSchema` artifact at `artifacts/cases-index.json`: the path and content hash of
    every registered case file, regenerated by `qa cases add` after every case-set mutation. The
    `cases` gate now binds exactly to this aggregate, the same exact-path binding `scope` already
    uses, instead of a `prefix` match against any file under `artifacts/cases/` — editing or adding
    any case file now changes the aggregate's hash and reopens the gate. `qa approve cases` must be
    called with `--artifact artifacts/cases-index.json` going forward.
  - New `FeatureCaseIndexSchema` artifact at `artifacts/cases-index/<feature>.json` (and a rendered
    `.md` alongside it via the existing Markdown renderer registry): a steps-free summary of every
    case registered for that feature — id, title, test type and the requirement(s) it covers — useful
    for a reviewer or agent orienting itself without reading every case's full JSON.

- 9a5b1fe: Add the generation contract (P3-05, ADR-0010) a future `qa-generate-tests` spoke (P3-07) and its
  verification loop (P3-06) build on: `GenerationSpokeInputSchema`/`GeneratedTestSpecSchema`
  (`@qa-ai-stlc/schemas`) fix the spoke's input (a case, a registry slice, the locator module's
  current exports) and output (a generated spec stamped with a `generatorVersion` and a
  `sourceHash`); `buildRegistrySlice`/`buildGenerationSpokeInput`/`stampGeneratedTestSpec`/
  `isGeneratedTestSpecStale` (`@qa-ai-stlc/core`) assemble and check them.
  `extractManualRegions`/`applyManualRegions` (`@qa-ai-stlc/core`) round-trip a human's
  `// qa:manual:start <id>` / `// qa:manual:end <id>` edits inside a generated spec across
  regeneration, reused unchanged by a later `qa upgrade` (P7-01).
- 344852d: Interactive case execution capability (P3-14, ADR-0009): the engine can now drive an approved test
  case live — a real browser action for `e2e`, a real HTTP call for `api`, a real axe-core scan for
  `a11y` — and register what happened as evidence and a run result, before any code is generated.

  - `qa.browser_open` gains an opt-in `executionMode` option that allows non-GET requests through a
    session's safe mode (still bounded by the domain allowlist), so a real form submission can be
    proven, not just clicked. Off by default; exploration and pick mode are unaffected.
  - New core operations: `runRegisterExecutedElement` promotes an ad hoc, registry-less element pick
    into the selector registry as `source: 'execute'` (a new `SelectorElementSourceSchema` value),
    re-verifying it resolves uniquely first. `runHttpExecute` makes a real HTTP call and registers
    the request/response as evidence (`HttpClient` gains a general-purpose `request()` method
    alongside its existing `get()`). `runBrowserAccessibilityScan` runs a real `axe-core` scan
    against the session's current page and registers the raw result as evidence. `runRegisterCaseResult`
    ties a run's evidence together into a `RunResultSchema` value, with the caller (not the engine)
    supplying the pass/fail verdict.
  - New runtime dependency: `axe-core` (MPL-2.0, maintainer-approved, see `NOTICE`).

- 72ebb8e: Add `qa-generate-tests` (P3-07): the skill that codifies a proven `qa-execute` session into a
  deterministic Playwright/API spec, plus the engine support it needs.

  `qa.browser_click`/`qa.browser_fill`/`qa.browser_navigate`/`qa.http_execute` accept an optional
  `stepId` (`'step-<N>'`, `N` the case step's 1-based position), carried inside the evidence content
  itself (`BrowserActionSchema`, new `HttpRequestRecordSchema`) rather than only on the `Evidence`
  wrapper, which is never persisted on its own. New core operation `findLatestProvenSession` (and its
  MCP wrapper `qa.generation_proven_session`) recovers a case's most recently proven session by
  reading its latest passing `RunResult` and grouping the evidence it points to by `stepId` — no
  separate session-log artifact. `GenerationSpokeInput` gains an optional `provenSession` field, so
  `isGeneratedTestSpecStale` (P3-04) picks up a re-executed `qa-execute` session as drift for free.

  `agents/skills/qa-execute` documents the `stepId` convention for every step-performing call;
  `agents/skills/qa-generate-tests` is new.

- 9380d0d: Add `qa run` / MCP `qa.run` (P3-04): runs a spec set through the `Runner` for its test type (only
  `e2e`, via `@qa-ai-stlc/runner-playwright`, has one so far) and persists every `RunResult` plus a
  new `RunRecordSchema` summary under `.qa/runs/<run-id>/results/` and `.qa/runs/<run-id>/run.json`.
  This is a new, per-invocation layout distinct from `qa.case_result_register`'s per-case one
  (`.qa/runs/<test-case-id>/`, P3-14): a run can cover many results from one spec set, a case-result
  registration covers exactly one ad hoc interactive check. `--environment <name>` resolves the
  `baseUrl` from `config.yaml`, the same domain-allowlist-aware resolution every other environment-
  aware command already uses.
- d72dc03: Add step/expected-result coverage tracking (P3-02). `RunResultSchema` gains an optional
  `missingStepIds` field, required and non-empty exactly when `status` is `'partial'`. A Playwright
  spec opts a test into coverage tracking with a `stepIds` annotation (`{ type: 'stepIds',
description: '<comma-separated ids>' }`) and titles each `test.step()` call `[<id>] <description>`;
  `playwrightRunner` parses the real JSON report's step titles and, when a `passed` or `failed` test
  did not reach every declared step, reports it as `partial` with the missing IDs instead of claiming
  a verdict the run never fully reached. A test with no `stepIds` annotation is unaffected.

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

## 1.0.0

### Major Changes

- 8c8971b: `TestCaseSchema` requires a new `feature` field (P2-20): an explicit, kebab-case, operator-chosen
  name for the tested feature a case belongs to (`FeatureIdSchema`, `packages/schemas`), never
  inferred from the case's title or a requirement id. This is a breaking schema change — an existing
  case JSON file without `feature` now fails validation and must be updated before it can be
  registered again.

  `qa cases add` / `qa.cases_add` now register a case under `artifacts/cases/<feature>/<id>.json`
  instead of the previous flat `artifacts/cases/<id>.json`, using the case's own `feature` field. `qa
validate` already lists `artifacts/cases/` recursively, so it reads a case at any folder depth; it
  still requires every case file, wherever it lives, to carry a valid `feature` — an existing flat
  case file needs `feature` added before `qa validate` can read it again.

- e968493: Fix `ManifestStore.verifyContent()`'s try-both hashing (added in the #277 fix) letting a
  CRLF-only edit to a bytes-registered artifact pass tamper detection: `hashText` normalizes CRLF to
  LF, so `hashBytes(bytes("a\nb"))` equals `hashText("a\r\nb")` whenever the original bytes are the
  UTF-8 encoding of LF-terminated text — trying a text hash as a fallback after a byte-hash mismatch
  made this collision reachable by an attacker, not just theoretical.

  `ManifestEntrySchema` now records `mode: 'text' | 'bytes'`, the hasher actually used at
  registration time. `verifyContent` checks only that recorded mode instead of guessing.

  Breaking for `@qa-ai-stlc/schemas`: `ManifestEntrySchema` gains a required `mode` field, so an
  existing `.qa/manifest.json` written before this change fails validation until every project runs
  an engine operation that re-registers its artifacts (`qa explore`, `qa scope`, etc.).

### Minor Changes

- bcad827: Adds `SpokeResultSchema`, the generic Zod-validated envelope every hub-and-spoke result flows
  through (development plan section 5.1, P2-08): a `status: 'ok' | 'error'` discriminated union
  carrying either an untyped `payload` a caller validates against its own task-specific schema, or a
  structured `SpokeError` (a stable `code`, a `message`, and optional `issues` describing exactly
  what a re-dispatch should fix). Also exports the supporting `SpokeErrorSchema` and
  `SpokeValidationIssueSchema`. Per-spoke-type payload schemas are added by the tasks that implement
  those spokes; this change adds only the shared envelope.
- 17d5441: Environments can now opt in to reaching a server behind a self-signed or internal-CA TLS
  certificate (P2-18): `environments.<name>.tlsInsecure: true` in `config.yaml` (`EnvironmentConfigSchema`,
  `packages/schemas`) bypasses certificate validation for that environment's `qa doctor` reachability
  check and every `qa explore`/`qa.browser_open` browser session, including scripted login. Off by
  default — an environment without it behaves exactly as before, rejecting an untrusted certificate.
  Enabling it prints a coded warning (`ENVIRONMENT_TLS_INSECURE`) on every run that uses it, since it
  weakens a real security guarantee.
- 1f205dd: Fix `pii`/`dynamicText` on a selector registry element being required booleans that every
  producer (crawl, static analysis, pick mode) hardcoded to `false`, with no detection logic
  anywhere in the repo. A required `false` read as "checked, and clean" — a claim nothing had
  verified (AGENTS.md 12.5, honest statuses).

  `SelectorElementSchema` now makes both fields optional; every producer omits them instead of
  asserting `false`, so a consumer can tell "not yet evaluated" from an actual check that found
  nothing. Not breaking: an existing registry with `pii: false`/`dynamicText: false` still validates
  unchanged, and no consumer branches on either field today.

- d1b29ee: Add reusable, non-secret test-data sets (P2-22): `TestDataSchema` (`packages/schemas`) is a named
  set of key/value variables, and `TestCaseSchema` gains an optional `testDataRefs` array so a case's
  steps or preconditions can reference shared values by id instead of inlining them.

  `qa test-data add` / `qa.test_data_add` validates a set and registers it under
  `artifacts/test-data/<feature>/<id>.json` (P2-20's feature-folder convention). `qa validate` now
  also rejects a case whose `testDataRefs` entry does not resolve to a registered set, reported as a
  new `unresolvedTestData` field on the validate report — both are additive, so nothing existing
  changes shape.

  Never holds credentials — those stay in identities / `QA_*` environment variables.

- 71bbbf7: Scope-aware state machine (P2-16, development plan section 2.7): the pipeline now enforces the
  testing-scope survey end to end instead of only at `qa init`.

  - `qa scope` and `qa cases add` now reject with a coded error while any testing type (`e2e`,
    `api`, `a11y`, `security`) is still `undecided` — previously only `qa init` checked this, and a
    project that later reset a type to `undecided` (or deferred the survey with `--defer-scope`)
    could scope and register cases anyway.
  - `qa cases add` also rejects a case whose own `testType` is not `in-scope`, so a case for an
    out-of-scope or undecided type is never silently registered.
  - Approving the `cases` gate now requires "one case set per in-scope type": every `in-scope` type
    needs at least one registered case, and no case may exist for a type that is not `in-scope`.
  - A later `qa config set testing.<type>` that changes a decided type reopens the `cases` gate the
    next time `qa approve`/`qa validate` runs, the same recompute-not-cache treatment `GateStateMachine`
    already gives an edited artifact's content hash (ADR-003) — `Approval` records an optional
    `testingScope` snapshot for this.
  - `qa validate`'s report gains `caseSetStatusByType`, one status (`satisfied`/`missing`/
    `not-applicable`) per case-bearing type, so an out-of-scope type's empty case set is reported as
    `not-applicable` rather than silently absent.

- f44a75b: Extend `TestCaseSchema` with two optional, ISO/IEC/IEEE 29119- and ISTQB-aligned fields (P2-17):
  `preconditions` (an array of strings, state that must hold before the first step) and
  `regressionTier` (`RegressionTierSchema`, one of `smoke` < `critical-path` < `regression` <
  `extended`, ordered from narrowest to widest run via the exported `REGRESSION_TIERS` tuple).
  `qa-design-cases` (P2-09) will set both on every case it writes; existing cases without them
  remain valid, since neither field is required.

  Adds `agents/references/testing-standards.md`, a shared reference on test-design techniques, the
  `TestCaseSchema`/`DefectDraftSchema` field conventions, and the regression-tier definitions, so
  `qa-design-cases`, `qa-execute` (P3-15) and `qa-generate-tests` (P3-07) can point to it instead of
  each restating the same background.

## 0.9.0

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

## 0.8.0

### Minor Changes

- 554ec6d: Add test case traceability (development plan section 2.7 step 9): a case must link to at least one requirement (`TestCaseSchema.requirementIds` now requires a non-empty array), and every link is checked against the scope artifact's actual requirement ids, not just validated for shape.

  `@qa-ai-stlc/core` gained `findUnlinkedRequirementIds`, a pure function cross-checking a case's `requirementIds` against a `Scope`.

  `@qa-ai-stlc/cli` gained `qa cases add --path <path>`: validates a test case written as JSON and registers it under `artifacts/cases/<id>.json`, rejecting it up front if any linked requirement does not exist in `artifacts/scope.json`. `qa validate` now also re-checks every already-registered case's links on every run — a link broken later by editing `scope.json` is caught here, not only at `cases add` time — and its exit code is nonzero for a reopened gate or any unlinked case.

## 0.7.0

### Minor Changes

- 0b5fbd6: Add the v0 pipeline state machine (ADR-003): `scope` then `cases`, approved in order, each gate bound to the SHA-256 of the exact artifact content it approves.

  `@qa-ai-stlc/schemas` gained `PipelineStateSchema` (artifact kind `state`, `.qa/state.json`), `PhaseNameSchema` and `GateStatusSchema`.

  `@qa-ai-stlc/core` gained `GateStateMachine` (`approve()`/`validate()`), `ApprovalLedgerStore` (`.qa/artifacts/approval-ledger.json`, append-only), `PipelineStateStore` and the exported `PHASES` order. `validate()` always recomputes every gate's status from the ledger and each approved artifact's current content rather than trusting a cached field — editing an approved artifact reopens its gate the next time `approve()` or `validate()` runs, with no separate tamper check needed.

  `@qa-ai-stlc/cli` gained two commands: `qa approve <gate> --artifact <path> --approved-by <name> [--note <text>]` and `qa validate`. `qa validate` exits nonzero only when a gate that had a real approval no longer matches it (a reopened gate), not for a phase simply not yet approved.

## 0.6.0

### Minor Changes

- 143e889: Add static route extraction to `@qa-ai-stlc/explorer`: `analyzeStaticRoutes()` extracts client-side route declarations from source — React Router's `<Route path="...">` JSX, and Vue Router's/Angular's `path: '...'` route-config objects under a `routes` array — with file and line locations, using the same lightweight lexical scan `analyzeStaticSource()` already uses rather than a per-framework AST parser. `mergeStaticRoutes()` merges the findings into a crawler-produced `RouteMap`, resolving each path against the map's own `startUrl` origin and skipping a route the crawler already found.

  `@qa-ai-stlc/schemas`'s `RouteDiscoveryMethodSchema` gains a `'static'` value, and `DiscoveredRouteSchema` gains an optional `sourceLocation` (the file and line a static route was found at, since there is no live navigation to point at instead).

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
