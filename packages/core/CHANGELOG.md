# @qa-ai-stlc/core

## 1.6.0

### Minor Changes

- 32bdb52: Add an `a11y` config block: WCAG version (`2.0`, `2.1` or `2.2`, default `2.1`), cumulative conformance level (`A`, `AA` or `AAA`, default `AA`), best-practice rules (default off), include and exclude selectors, and known-issue exceptions with a rule id, a reason and an optional expiry. `qa init` (`--a11y-wcag-version`, `--a11y-level`, `--a11y-best-practices`) and `qa.init` (`a11y`) record the target when accessibility testing is in scope, and the `qa-start` skill asks for it.
- dfafb00: Add a per-criterion accessibility conformance section to `qa report` and `qa.report`, built from the recorded axe-core scans, and record the passed and inapplicable rules in the scan evidence.
- a6bc034: `runHttpExecute` authenticates through a named `apiAuth` profile (`auth`, or the environment's default): basic, bearer, api-key in a header or query parameter, custom headers and OAuth2 client credentials with an in-memory token cache. Credentials are read from `QA_*` variables, attached only after the request URL passes the allowlist (the token URL is checked too), never sent across a redirect, and scrubbed by value and by configured name from the stored request record. Response `Set-Cookie` and `Authorization` headers are now redacted in http-request evidence.
- 9fd9564: Authenticate API specs through `apiAuth` profiles. The engine generates `tests/qa/api-auth.ts` (when an `api` spoke input is built, before a generated spec is typechecked, and before an API run); a spec calls `request.get(url, apiAuth('<profile>'))` and the profile name is a literal union, so an unknown profile fails typechecking. `runner-api` resolves the profiles a spec names, hands them to the Playwright process through its environment only, refuses to do so for a base URL outside the environment's allowlist, and scrubs the credential values from the failures it reports. A spec that carries a credential of its own (an `Authorization` or `Cookie` header, a header or query parameter a profile uses, or a `Bearer`/`Basic` value) is rejected with `HTTP_CREDENTIAL_INPUT_REJECTED` before it runs. A run that carries a credential records no Playwright trace, because a trace archive holds request headers and cannot be scrubbed. `ProcessRunOptions` gains `env` and `runPlaywrightSpecs` takes `env` and `isTraceEnabled`.
- f664f1c: Generate API specs through the verification loop. For an `api` case, `qa.generation_spoke_input` returns `apiContract` (the contract operations the case names, plus the contract SHA-256) instead of a registry slice and locator module, and `qa.generation_verify` runs the spec through `runner-api`. A generated API spec must declare `export const CONTRACT_SHA256 = "<hash>"`: verification rejects a spec that does not match the input's hash, and `runner-api` rejects a spec once the live contract hashes differently (`API_SPEC_CONTRACT_CHANGED`). `registrySlice` and `locatorModule` are now optional in the spoke input schema and required only for non-`api` cases. The `qa-generate-tests` skill documents the API flow.
- eb9580e: `qa.browser_console` and `qa.browser_network` read back what a session's pages logged and requested. The console tool returns messages and uncaught exceptions as level and text, redacted of secret shapes and capped; the network tool returns method, status or failure, and a templated URL (identifiers become `:id`, query parameters keep their names but never their values). Neither reads a header, cookie or body. Both take a `since` cursor, a `limit` (at most 100) and `errorsOnly`, report how many entries were left out or already dropped, and register the full redacted log as evidence.
- e0a6192: A browser session now handles JavaScript dialogs and the pages the application opens. `alert`, `confirm` and `prompt` are dismissed by default (`qa.browser_open` takes `dialogPolicy: 'accept'` to accept them instead); each is recorded as a `dialog` evidence record and reported in `notices` in the result of the next click, key press, checkbox change, navigation or snapshot. A page a link or script opens joins the session as a tab and `qa.browser_tabs` lists the tabs and switches the active page, which retires the snapshot refs of the page it leaves. A page that opens off the domain allowlist is closed by the engine and reported as `tab-blocked`. Safe mode and the allowlist are now installed on the browser context instead of the first page, so they cover a popup's first request too.
- c649f7d: `qa.browser_expect` checks one expected result in the page: an element visible or hidden, its text, its value, how many elements match, a checkbox state, or the page URL. It looks again until the expectation holds or the wait runs out (never longer than the environment action timeout), and registers an `expect` evidence record with what the page showed and the engine's `passed` verdict. A failed expectation is returned with the observed value rather than thrown; a malformed one is `BROWSER_EXPECT_INVALID`. A check that reads one element fails if the selector matches several, and the value of a password field is recorded as `[redacted]`. The evidence action type gains `expect` and an optional `expectation` field.
- 2338a38: `qa.browser_press` presses a key or chord on an element or on the page, `qa.browser_hover` moves the pointer over an element, and `qa.browser_check` sets a checkbox or radio to a state and reads it back; each registers an action evidence record. Safe mode still blocks any non-GET request a key press sets off. A lone character pressed is recorded as `[character]`, and a box the page leaves in another state is `BROWSER_CHECK_NOT_APPLIED` and registers nothing. The evidence action type gains `press`, `hover` and `check` with optional `key` and `checked` fields.
- 18f524e: `qa.browser_snapshot` returns a `snapshotId` and accepts `since: <snapshotId>`: the view then lists only the lines added or removed since that snapshot of the same session, under the same size cap, and elements that did not change keep the refs they had. The full tree is still registered as evidence. An id from another session, or one past the last five kept, is `BROWSER_SNAPSHOT_UNKNOWN`.
- cc53150: `qa.browser_upload` sets files on a file input from project-relative paths and registers an `upload` evidence record with the name, size and SHA-256 of each file, never its content or its project path. Paths are refused with `BROWSER_UPLOAD_PATH_INVALID` when they leave the project (including through a symbolic link) or sit under `.qa/` or `.git/`, a missing file is `BROWSER_UPLOAD_FILE_MISSING`, a file that matches a secret pattern is `BROWSER_UPLOAD_SECRET`, and a file over 10 MB is `BROWSER_UPLOAD_TOO_LARGE`. Each file is read once, and those exact bytes are scanned, hashed and sent; the input is read back and a page that does not hold the files is `BROWSER_UPLOAD_NOT_APPLIED`. The `FileSystem` port gains `realPath`.
- 35d621d: `qa.browser_wait_for` waits for an element to be visible, hidden, attached or detached, for text to appear or disappear (on the page or inside one element), or for the URL to match, and registers a `wait-for` evidence record with what it waited for and how long it took. It never waits longer than the environment action timeout; a condition that never holds is `BROWSER_WAIT_TIMEOUT` naming it and registers nothing, and a malformed call is `BROWSER_WAIT_INVALID`. Looking at an element that vanishes between being counted and being read now reports it as gone instead of waiting out the action timeout, which also applies to `qa.browser_expect`.
- 770cc78: Engine browser actions now wait for busy indicators to clear. `qa.browser_click` and `qa.browser_fill` wait before and after the action, and `qa.browser_navigate` waits once the page has loaded. The indicators are the selected component library's own (a loading mask) plus the project's `ui.busySelectors`, and the wait is bounded by the environment's action timeout. An indicator that never clears fails with the coded error `BROWSER_BUSY_TIMEOUT` instead of a lost click.
- 8cf3406: `qa.browser_snapshot` returns the page as a compact outline of its accessibility tree instead of only evidence ids. The outline is capped at 16000 characters, carries a short ref (`e1`, `e2`, ...) on every actionable node, and sits between untrusted-data markers; `truncated` and `omittedLineCount` report anything cut. The full tree is still registered as evidence. A screenshot is taken only with `screenshot: true`, so the result's `screenshot` field is now optional. `normalizeAccessibilityTree`, `truncateText`, `capArray` and the normalization limits moved from `@qa-ai-stlc/explorer` to `@qa-ai-stlc/core`.
- cd183b0: Component library widgets can be driven at the widget level. The new tools `qa.browser_select_option` (an option by its visible text), `qa.browser_set_date`, `qa.browser_open_popup` and `qa.browser_close_popup` find the widget wrapper from the registry's selector, act, and check the widget's resulting state before registering the action as evidence; a widget that does not take the value fails with `BROWSER_WIDGET_VALUE_MISMATCH`, a list without the option with `BROWSER_WIDGET_OPTION_NOT_FOUND`, and a popup that does not follow with `BROWSER_WIDGET_POPUP_STATE`. The Kendo UI for jQuery and Angular profiles declare which of their widgets support which actions, and the generated `tests/qa/locators.ts` gains a matching helper per widget (`<name>SelectOption`, `<name>SetDate`, `<name>OpenPopup`, `<name>ClosePopup`) so a generated spec calls it instead of a click sequence. The evidence action types gain `select-option`, `set-date`, `open-popup` and `close-popup`.
- b5ee556: The browser action tools (`qa.browser_click`, `qa.browser_fill`, `qa.browser_select_option`, `qa.browser_set_date`, the popup tools and the grid tools) accept `ref` from the session's latest `qa.browser_snapshot` in place of `selector`; exactly one of the two is required (`BROWSER_TARGET_INVALID` otherwise). The engine resolves a ref to a role and exact-name selector, records that selector and the ref's role and name in the action evidence, and acts on the selector. A ref from an earlier snapshot, a ref used after a navigation or once the page URL changed, and a ref whose role and name no longer match exactly one element all fail with `BROWSER_REF_STALE`. Refs are numbered across the whole session, so one from an older snapshot is never mistaken for a new element. Action evidence gains an optional `ref` field.
- c7d5747: Data grids can be searched by content. `qa.browser_grid_find_row` finds the row with a given value under a column header and reads its cells; `qa.browser_grid_read_cell` returns one cell of that row. A grid with a pager is searched page by page (rewinding to its first page first), and a virtualized grid by scrolling it from the top, bounded by `maxSteps`. A value held by more than one rendered row is refused as `BROWSER_GRID_ROW_AMBIGUOUS` rather than guessed, a missing row is `BROWSER_GRID_ROW_NOT_FOUND`, and a missing header is `BROWSER_GRID_COLUMN_NOT_FOUND`. The Kendo UI for jQuery and Angular profiles declare their pager buttons and scroll container, and the evidence action types gain `grid-find-row` and `grid-read-cell`.
- 552493f: `qa.http_execute` takes `auth`, the name of an `apiAuth` profile, and the engine adds the credential itself. A raw `Authorization` or `Cookie` header, a header or query parameter that any profile declares, is now rejected with `HTTP_CREDENTIAL_INPUT_REJECTED` and a remediation pointing at profiles. OAuth tokens are cached for the life of the MCP server process.
- c4db737: `qa.browser_accessibility_scan` now runs axe-core against the configured `a11y` target: the WCAG version and cumulative level pick the rule tags (AAA rules are enabled explicitly, as axe-core disables them by default), best-practice rules are opt-in, and include/exclude selectors narrow the scan. `incomplete` results are reported as `uncertain`, violations covered by an unexpired exception are reported as `excepted` instead of dropped, and the evidence records the axe-core version and a hash of the effective `a11y` config.
- 088549c: MCP tools `qa.init`, `qa.config_set` and `qa.config_add` let the operator run the testing-scope survey and edit `.qa/config.yaml` inside the agent host. `qa.init` takes an explicit answer for every testing type (or an explicit `undecided`), returns the absolute project root for the operator to confirm before writing anything, and refuses when `.qa/` already exists in the directory or a parent. The MCP server now resolves the project root the way `qa-start` does: the nearest directory upward that holds `.qa/`. The `init`, `config set` and `config add` operations moved from the CLI into `@qa-ai-stlc/core`; the CLI commands behave as before.
- 4e43236: `qa.browser_select_option` also picks an option of a native by its visible text and checks the select shows it afterwards; a multi-select keeps what it already had chosen. An option the select does not have is `BROWSER_WIDGET_OPTION_NOT_FOUND`, and the error names the options it does have.
- 68de716: An `oauth2-client-credentials` profile that gets a 401 with a cached token now drops the token, fetches a new one and retries the call once; a token that was just fetched is never retried. Every credential used by either attempt is scrubbed from the stored request record.
- 210e92b: Add `@qa-ai-stlc/runner-api` and route `qa run --test-type api` (MCP `qa.run`) through it. Before any spec runs it loads the OpenAPI 3.x contract named by `api.source` and checks every case the spec declares: the case must be an `api` case listing the contract operations it exercises in the new optional `endpoints` field, and every one must exist in the contract, otherwise the run is rejected with `API_CASE_NOT_IN_CONTRACT` before a request is sent. The contract text is stored as `artifacts/api-contract.txt` and registered in the manifest. Contract loading and OpenAPI parsing move from the explorer into `@qa-ai-stlc/core` (`loadApiContract`), and contract URLs and discovery probes are now checked against the environment's scheme and port as well as its hostname.
- f1dc0fb: A `from-browser` auth profile reads its token where an operator would find it in developer tools: a cookie, a `localStorage` or `sessionStorage` key (with an optional JSON path) or the observed `Authorization`-style request header, from an open `qa.browser_open` session (`sessionId`) or, for cookies and `localStorage` only, from an identity's saved storage state (`identity`). Only allowlisted origins are read, a session of another environment is refused, the token is read on every call and never returned to the agent or stored in evidence.
- 29c8fdb: Add a `ui.componentLibrary` config setting (`none`, `kendo-jquery` or `kendo-angular`, default `none`). `qa init --component-library` and `qa.init` (`componentLibrary`) record the answer, the `qa-start` skill asks for it, and `qa config set ui.componentLibrary <value>` and `qa.config_set` change it later.
- 16cf78b: Add a catalogue of WCAG 2.0, 2.1 and 2.2 success criteria, classified by how far axe-core covers each one, and a manual checklist of the in-scope criteria that automated scanning cannot decide.

### Patch Changes

- 06c0685: `qa.browser_select_option` no longer fails when the list closes itself between finding an option and clicking it. The first click is bounded to five seconds; if it cannot land, the popup is reopened and the click repeated once with the full action timeout, and that second failure is the one reported. The option helpers in a generated locator module do the same.
- 8b52efc: Choosing an option of a list widget (`qa.browser_select_option` and the generated widget helpers) is made once more when the widget does not show the choice at first, as it can on a loaded machine. A widget that still does not show it is reported as before.
- Updated dependencies [32bdb52]
- Updated dependencies [dfafb00]
- Updated dependencies [d6dfc44]
- Updated dependencies [c3967a9]
- Updated dependencies [f664f1c]
- Updated dependencies [e0a6192]
- Updated dependencies [c649f7d]
- Updated dependencies [2338a38]
- Updated dependencies [cc53150]
- Updated dependencies [35d621d]
- Updated dependencies [770cc78]
- Updated dependencies [953c27d]
- Updated dependencies [cd183b0]
- Updated dependencies [b5ee556]
- Updated dependencies [c7d5747]
- Updated dependencies [210e92b]
- Updated dependencies [29c8fdb]
  - @qa-ai-stlc/schemas@1.6.0

## 1.5.0

### Minor Changes

- 4da23d6: Add `qa config show [--explain]` and MCP `qa.config_show` (ADR-011): prints the effective configuration merged from `.qa/config.yaml` and its optional local layer, the local layer's path, and every relaxation it introduces. `--explain` also names the source layer (`committed`, `local` or a schema default) of every value. An identity's `secret` is always its environment-variable name; its value is never read or shown.
- 1e2ab70: Move six project-specific engine constants into config (P6-23), each defaulting to its former hardcoded value so behavior does not change without config:

  - `selectors.stabilityViewports` — the viewports a locator candidate is scored at (was: desktop/tablet/mobile, unconditionally).
  - `selectors.defaultLoginSelectors` — the generic login-form selectors used when an identity's own `selectors` names none.
  - `selectors.extraStableAttributes` — attributes, beyond `testIdAttribute`, synthesized as an extra CSS candidate when an element carries one.
  - `selectors.generatedIdPatterns` — regular expressions an `id` is checked against before it is used as a CSS fallback candidate, so a framework-generated id (React's `useId`, a CSS-module hash) is never picked.
  - `environments.<name>.navigationTimeoutMs` / `actionTimeoutMs` — Playwright's navigation and action timeouts for `qa.browser_navigate`/`_click`/`_fill`, per ADR-011 a field of the environment rather than a generic overrides block.
  - `evidence.httpBodyPreviewMaxLength` — the cap on a stored HTTP response-body preview (`qa.http_execute`), was a hardcoded 4000.

  `navigationTimeoutMs`/`actionTimeoutMs` apply to the interactive `qa.browser_*` session only; explorer's own crawl, analysis and registry-build navigation, and scripted login, are unchanged and still use Playwright's default. `extraStableAttributes` is not available during manual pick mode, which has no live DOM read for an arbitrary attribute.

- 08972c0: `qa init` writes a commented `.qa/config.local.yaml.example` showing the optional local configuration layer's syntax (ADR-011). `qa doctor` / `qa.doctor` now report every relaxation the local layer introduces (a widened allowlist entry or `tlsInsecure: true`), the same way `qa config show` / `qa.config_show` already do — `DoctorReport` gains a `relaxations` field. README and CONTRIBUTING describe the configuration layers.
- 434e07f: Load the configuration in two layers (ADR-011): `.qa/config.yaml` plus an optional, git-ignored `.qa/config.local.yaml`, or the file named by `QA_CONFIG_LOCAL`. The local layer may set only `environments`, `identities`, `source` and `agents`; objects merge key by key and arrays and scalars replace. Validation errors name the file each bad value came from. Every CLI command except `init` prints a `CONFIG_RELAXATION` warning to stderr for each allowlist entry or `tlsInsecure: true` that the local layer adds. `qa init` adds `/config.local.yaml` to `.qa/.gitignore`, including in existing projects.

### Patch Changes

- 21e7319: `qa.generation_register` no longer trusts a verification outcome supplied by the caller. `qa.generation_verify` now records every outcome as an engine-written, manifest-registered verification record under `.qa/verifications/` and returns its `verificationId`; `qa.generation_register` takes the `spec` and that `verificationId` instead of `result` and `contentSha256`. Registration is rejected with a coded error when no such record exists, the record was edited, it did not end `verified`, it was already used, or the spec's test case, file path or content differ from what was verified. Verification also requires the test case to be registered and unchanged. `qa init` adds `/verifications/` to `.qa/.gitignore`.
- 84ed459: `qa.http_execute` no longer accepts a `tlsInsecure` input: certificate validation now follows the
  resolved environment's `tlsInsecure` in `config.yaml`, the same as `qa.browser_open`. Previously a
  caller could disable validation for any call to an allowlisted host, and an environment configured
  with `tlsInsecure: true` was not honored for HTTP calls unless the caller repeated it. A warning is
  logged when the environment disables validation. `runHttpExecute`'s `tlsInsecure` option is removed.
- 16b80d4: Generated-spec verification no longer fails in a project whose working directory contains a `tsconfig.json`. TypeScript 6 refuses to typecheck explicit files in that case (TS5112), so every spec was reported as `typecheck_failed`. Verification now passes `--ignoreConfig` and keeps typechecking against its fixed baseline.
- fbbbab7: Fixed `config.yaml`'s `selectors.testIdAttribute` being silently ignored: the crawler, pick mode
  and static source analysis all hardcoded `data-testid` regardless of what was configured, so an
  application using a different stable test attribute (e.g. `data-ui-id`) got no test-id locator
  signal at all. The configured attribute is now read consistently by exploration, and by Playwright
  itself (`getByTestId()`) during both live stability scoring and generated test execution.
- Updated dependencies [1e2ab70]
- Updated dependencies [21e7319]
- Updated dependencies [434e07f]
- Updated dependencies [a9488cb]
  - @qa-ai-stlc/schemas@1.5.0

## 1.4.0

### Minor Changes

- 97a57f7: `qa-generate-tests`'s generation-contract and verification-loop engine support (P3-06/P3-07) is now
  reachable through MCP, not only as internal `@qa-ai-stlc/core` library functions an agent has no way
  to call: new `qa.generation_spoke_input` (assembles a spoke task's input from a registered case, a
  registry slice and the locator module's real `GENERATOR_VERSION` stamp), `qa.generation_verify`
  (typechecks and executes a candidate spec once, against a scratch copy, cross-checking coverage
  against the case's own canonical steps), `qa.generation_register` (writes and registers only a
  `'verified'` outcome, content-hash bound), and `qa.generation_manual_regions_extract`/`_apply`
  (deterministic `// qa:manual` region splicing, so hand-written additions survive regeneration). New
  `@qa-ai-stlc/core` operation `runBuildGenerationSpokeInput`. Proven end to end against the demo app
  in CI, with no model call, standing in for what a real spoke would produce.

### Patch Changes

- @qa-ai-stlc/schemas@1.4.0

## 1.3.0

### Minor Changes

- efb7692: Flags a test case as flaky when its run history flips status within a configurable window
  (`flaky.historyWindow` / `flaky.minStatusChanges` in `config.yaml`). The traceability matrix
  (`qa report`) now shows a `Flaky` column per case, computed from every recorded run under
  `.qa/runs`, not a fixed pass-rate formula — a case that always fails is never flagged flaky.
- 535e2e9: Adds `qa link <spec> <requirement-id> --feature <name>` / `qa.link`: folds an already-existing,
  hand-written Playwright spec into the requirement → case → result → evidence traceability matrix
  without running it through generation. Reuses the spec's own `testCaseId` annotation when present,
  so a later `qa run` still attributes its result to the same case.

### Patch Changes

- 6d5c9da: Fixes `runRegisterCaseResult` / `qa.case_result_register` accepting a fabricated result: it now
  rejects a `testCaseId` that does not resolve to a registered test case, an `evidenceIds` entry that
  was not actually registered under the given `runId`, and a `passed` result with zero evidence.
  Previously none of these were checked at registration time, so a caller could register a permanent,
  manifest-backed "passed" result for a test case that does not exist, backed by no real evidence.
- ddd1bcd: `verifyGeneratedTestSpec` now requires the `TestCase` a generated spec claims to codify and checks
  execution coverage against that case's own canonical step/expected-result ids (`canonicalStepIds`),
  never the spec's own self-declared `stepIds` annotation. Previously coverage was checked only
  against what the candidate spec itself chose to declare, so a spec with an empty body (only a
  `testCaseId` annotation, no assertions, no `stepIds` declaration) reported `passed` and was accepted
  as `'verified'`. `Runner.run()` gained an optional `requiredStepIds` input that
  `runner-playwright`'s `mapReportToRunResults` honors as the authoritative required set when given,
  overriding the spec's own declaration; ordinary `qa run` over hand-written specs is unaffected.
- 6c06b46: Fixes two bugs that made `qa validate` always report false tampering right after a clean `qa
explore`: `persistExploreResult` registered `selectors/registry.json` and
  `selectors/missing-test-ids.json` with a hash computed from a differently-formatted
  `JSON.stringify` than what was actually written to disk, and `qa validate`'s tamper sweep resolved
  `tests/qa/locators.ts` (registered outside `.qa/`, per ADR-006) under `.qa/` instead of the project
  root.
- 592d606: `qa run` / `qa.run` now fails with a coded `RUN_NO_RESULTS` error when a spec set produces zero
  results — a `--spec` path that does not exist or matches no tests previously wrote an empty
  `RunRecord` and exited `0`, a silent false green since nothing was actually verified. Distinct from
  a run that produced results with a `skipped`/`passed` status, which is unaffected.
- 671249f: `verifyGeneratedTestSpec`'s `'verified'` outcome now carries a `contentSha256` of the exact content
  that was typechecked and executed, and `registerVerifiedGeneratedTestSpec` rejects a mismatch
  between that hash and the `GeneratedTestSpec.content` it is asked to write. Previously the two were
  never compared, so a caller could verify one spec and register a completely different one under the
  same `testCaseId`, defeating the verification loop (P3-06).
- Updated dependencies [efb7692]
  - @qa-ai-stlc/schemas@1.3.0

## 1.2.0

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

- 30446d2: Add evidence capture during runs (P3-03, ADR-004/ADR-005). `runner-playwright` now enables
  Playwright's own screenshot-on-failure and trace-on-failure capture and reads back whatever it
  attached to a failed or retried test; the `Runner` interface's `run()` returns a `RunnerOutcome`
  per result (the `RunResult` paired with that raw, unregistered evidence) instead of a bare
  `RunResult[]`, so a runner still never writes to the evidence store itself. `runTestRun` (`qa run`
  / MCP `qa.run`) registers each item through `EvidenceStore` — hashed, scanned for leaked secrets
  and, for `network-har`, redacted, same as every other evidence path (AGENTS.md 12.5) — and fills in
  the matching `RunResult.evidenceIds`. A `failed` result with no evidence registered after that
  (every item was quarantined, or the runner captured none) now throws `RUN_RESULT_MISSING_EVIDENCE`
  instead of silently persisting an unbacked failure.
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
- 1ff0e16: Add `qa report` / MCP `qa.report` (P3-08, ADR-002): renders a run summary and the requirement →
  case → result → evidence traceability matrix as Markdown or HTML, from the canonical JSON already
  recorded under `.qa/` — no hand-written report path exists. `buildTraceabilityMatrix`
  (`@qa-ai-stlc/core`) joins every requirement in `scope.json` against every case that links to it
  and each case's most recent run result across every run ever recorded, not just the one being
  reported on. Defaults to the most recently started run and Markdown format;
  `--run <run-id>`/`runId` and `--format markdown|html`/`format` select otherwise. Two new artifact
  kinds (`run-summary`, `traceability-matrix`) join the existing Markdown renderer registry, and a
  new HTML renderer registry mirrors it — the framework's first HTML output.
- 43c1c0e: Add the `Runner` interface (`@qa-ai-stlc/core`) and `@qa-ai-stlc/runner-playwright`, its Playwright
  implementation for `e2e` test cases (P3-01, ADR-004). Given a spec set of absolute paths to
  Playwright `.spec.ts` files, `playwrightRunner.run()` spawns the real Playwright Test runner
  directly through its resolved CLI entry point against an ephemeral, import-free config, then maps
  the real JSON report it produces to validated `RunResult` values. A spec attributes its result to a
  test case with a `testCaseId` annotation (`test(title, { annotation: { type: 'testCaseId',
description: '<id>' } }, ...)`); a spec with none makes `run()` throw rather than guess. Evidence
  capture during runs is P3-03, not this package — every result's `evidenceIds` is empty for now.
- 1775c76: Add `qa validate --run` / MCP `qa.validate` with `checkRuns: true` (P3-09): an opt-in sweep of
  every recorded `RunResult` — from `qa run` or from interactive case execution alike — for a
  fabricated evidence link (an `evidenceIds` entry with no matching registered evidence file,
  excluding a quarantined item's own receipt) and for a `failed` result with no registered evidence
  at all. Independent of `runTestRun`'s own write-time `RUN_RESULT_MISSING_EVIDENCE` check, this
  catches the same gap in results written through any path, including `qa.case_result_register`,
  which accepts a caller-supplied `evidenceIds` with no such check. Also fixes a real bug found
  while building this: `buildTraceabilityMatrix` (P3-08) only scanned `qa run`'s own
  `runs/<run-id>/results/` layout, silently missing every result interactive case execution wrote
  under its own flat `runs/<test-case-id>/` layout — both now share a new `listRunResultPaths`
  helper.
- 71c360e: Add the generation verification loop (P3-06, development plan section 5.2): a generated spec
  (P3-05's `GeneratedTestSpec`) is never registered on trust. `verifyGeneratedTestSpec` typechecks it
  against a real `tsc` invocation and, only if that passes, executes it once through the injected
  `Runner`; either failure returns `SpokeValidationIssue[]` naming exactly what to fix (a typecheck
  diagnostic's file/line/column, or an execution failure's `RunResult.failure`/`missingStepIds`).
  `registerVerifiedGeneratedTestSpec` writes the spec to its real path and the manifest, and only
  accepts a `'verified'` outcome. `hasVerificationRetryBudget` reads the existing
  `config.agents.retries` field. New `FileSystem.deleteFile()` port method, and a new pinned
  `typescript` runtime dependency for the `tsc` spawn.

### Patch Changes

- e0603c1: Fixes `qa.http_execute` (#364): it made a real HTTP call to any URL it was given, with no check
  against the environment's configured domain allowlist — the only `qa.browser_*`-adjacent tool that
  didn't. `runHttpExecute` now resolves the environment (a new optional `environment` option, same
  lookup `qa.browser_open` already uses) and rejects a URL off its allowlist with
  `BROWSER_URL_NOT_ALLOWED` before making any request. This restricts which host can be called, never
  which method: a real POST/PUT/DELETE against an allowed host still works, exactly as `api`
  test-type execution requires.
- Updated dependencies [8ec2ace]
- Updated dependencies [9a5b1fe]
- Updated dependencies [344852d]
- Updated dependencies [72ebb8e]
- Updated dependencies [9380d0d]
- Updated dependencies [d72dc03]
  - @qa-ai-stlc/schemas@1.1.0

## 1.1.0

### Minor Changes

- 47ce6c6: Reusable JSON-to-Markdown artifact renderer, starting with test cases (P2-25, ADR-002): a real
  test case can now be rendered as a numbered, presentable Markdown document — preconditions, steps,
  expected result and case metadata (feature, requirement links, regression tier, status) — instead
  of only being visible as raw JSON.

  - `qa cases render <id>` (CLI) and `qa.cases_render` (MCP) find the registered test case with the
    given id under `artifacts/cases/**` and render it to Markdown.
  - The renderer lives behind a per-artifact-kind registry in `packages/core`, structured so a second
    artifact kind (`DefectDraftSchema`/RCA rendering, Phase 4+) can register its own Markdown
    template later without modifying the test-case renderer's code.

## 1.0.1

### Patch Changes

- af2f3da: Reduces install time for `@qa-ai-stlc/mcp-server` and every consumer of `@qa-ai-stlc/core` (#333):
  `core` now depends on `playwright-core` instead of the full `playwright` package for its browser
  launcher and reachability checks. `qa doctor --fix` (`installBrowsers`), the only feature that
  needed the full package's installer CLI, now fetches it on demand via `npx playwright install`
  instead of requiring it as a permanent dependency — behavior is unchanged, but a real operator's
  first `npx -y @qa-ai-stlc/mcp-server` no longer pays for a package it may never use. `core`'s
  `nodeProcessRunner` (the `ProcessRunner` port's default implementation, used by `installBrowsers`
  and available to any future caller) now spawns via `cross-spawn` instead of `node:child_process`
  directly, so it can safely invoke a Windows `.cmd`/`.bat` shim like `npx` without `shell: true`.
- Updated dependencies [3590f7a]
  - @qa-ai-stlc/schemas@1.0.1

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

- adaa974: Fix `qa validate`/`qa.validate` reporting every binary evidence artifact (screenshots, traces,
  video) as tampered, even freshly registered and untouched. `EvidenceStore` hashes binary content
  byte-for-byte (`hashBytes`); the tamper check re-read every manifest-registered path through a
  lossy UTF-8 text decode regardless of that, so a re-hash could never match.

  `ManifestStore` gains `verifyContent(relativePath, rawBytes)`: since the manifest does not record
  which hasher an entry used, it checks raw bytes against both a binary hash and a text hash of
  their UTF-8 decoding, which is strictly more correct than assuming one encoding. The `FileSystem`
  port gains a required `readBytes(absolutePath)` method (breaking for a custom implementation) so
  the tamper check can read a file without assuming its encoding ahead of time.

- bb0a0aa: Fix the browser domain allowlist not being enforced on navigation triggered by `qa.browser_click`
  (or any other in-page action), only on `qa.browser_navigate`'s own input. Safe mode's route
  handler, which sees every request a session makes regardless of what triggered it, now also
  checks each GET request's hostname against the session's allowlist and aborts it the same way it
  already aborts non-GET requests, instead of only inspecting the HTTP method.

  Breaking for `@qa-ai-stlc/core`: `createBrowserSafeModeRouteHandler` takes the session's allowlist
  as a new required first argument.

- e288603: Fix `qa approve`/`qa.approve` accepting any existing file as a gate's artifact, and the approval
  ledger being unprotected against a hand-edit — together these let a gate approval be forged with
  nothing detecting it: editing an artifact, recomputing its hash, and writing that hash into the
  corresponding ledger entry used to pass `qa validate` as a genuinely approved gate.

  `GateStateMachine.approve()` now requires the artifact to be manifest-registered — the content the
  engine itself last wrote to that path — throwing the existing `ARTIFACT_UNREGISTERED` /
  `ARTIFACT_HASH_MISMATCH` coded errors instead of silently approving. `ApprovalLedgerStore` now
  registers `artifacts/approval-ledger.json` in the manifest on every append, so a hand-edit to the
  ledger itself is caught by `qa validate`'s tamper check the same as any other artifact.

  Breaking for `@qa-ai-stlc/core`: `ApprovalLedgerStoreOptions` and `GateStateMachineOptions` both
  gain a required `manifest: ManifestStore` field.

### Minor Changes

- 17d5441: Environments can now opt in to reaching a server behind a self-signed or internal-CA TLS
  certificate (P2-18): `environments.<name>.tlsInsecure: true` in `config.yaml` (`EnvironmentConfigSchema`,
  `packages/schemas`) bypasses certificate validation for that environment's `qa doctor` reachability
  check and every `qa explore`/`qa.browser_open` browser session, including scripted login. Off by
  default — an environment without it behaves exactly as before, rejecting an untrusted certificate.
  Enabling it prints a coded warning (`ENVIRONMENT_TLS_INSECURE`) on every run that uses it, since it
  weakens a real security guarantee.
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

- 2334df3: Fix `GateStateMachine.approve()` accepting any manifest-registered artifact for any gate:
  `#278` required the artifact at `artifactPath` to be manifest-registered, but `artifactPath` was
  still a free-form, caller-supplied string with no mapping from a gate name to the artifact it
  actually expects. Approving `scope` with a completely unrelated, engine-registered artifact (for
  example one meant for a different gate) satisfied the gate and advanced `currentPhase`.

  `approve()` now checks `artifactPath` against a canonical binding per gate before accepting it:
  `scope` binds only to `artifacts/scope.json`; `cases` binds to any path under `artifacts/cases/`,
  since each test case is its own file rather than a single rollup artifact. A mismatch is rejected
  with `GATE_ARTIFACT_PATH_MISMATCH` instead of silently satisfying the wrong gate.

- 2235987: Fix HAR redaction skipping the request/response body, and the secret scanner's safety net missing
  an unquoted credential in a URL-encoded form. `redactHar` only touched `headers`/`cookies`, so a
  login form's POST body (`username=alice&password=hunter2`) could reach `.qa/evidence/` completely
  unredacted while still reporting `redacted: true`. The scanner's `password-assignment`/
  `api-key-assignment` patterns also required a quoted value, so `password=hunter2` (no quotes, a
  normal URL-encoded shape) didn't trip the fallback that exists specifically to catch what
  redaction couldn't understand.

  `redactHar` now also redacts known-sensitive fields (password, token, secret, API key) in
  `request.postData`/`response.content`, for both JSON and URL-encoded bodies. The scanner's two
  patterns now also match an unquoted value.

- c1f4de6: Fix `ApprovalLedgerStore.load()` trusting a hand-written `artifacts/approval-ledger.json` on a
  project with no prior approvals: `append()` registers the ledger in the manifest (#278), but a
  project where `append()` had never run had no manifest entry to compare against, so `load()`
  returned whatever the file on disk said with no check at all. A forged ledger paired with a
  matching hand-written artifact satisfied a gate and advanced `currentPhase` with nothing detecting
  it — `qa validate` reported `tamperedArtifacts: []`.

  `load()` now checks the manifest before trusting the ledger's content: an unregistered ledger is
  treated the same as no approvals yet, so a forged gate can no longer report `satisfied`.
  `qa validate` also now lists the ledger path in `tamperedArtifacts` whenever it exists on disk but
  was never registered, so the forgery stays visible instead of silently reading as "nothing
  approved yet".

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

- Updated dependencies [bcad827]
- Updated dependencies [17d5441]
- Updated dependencies [8c8971b]
- Updated dependencies [e968493]
- Updated dependencies [1f205dd]
- Updated dependencies [d1b29ee]
- Updated dependencies [71bbbf7]
- Updated dependencies [f44a75b]
  - @qa-ai-stlc/schemas@1.0.0

## 0.11.0

### Minor Changes

- 0e329ac: `.qa/` integrity (P2-07): `qa scope` and `qa cases add` (and their MCP counterparts) now verify
  `artifacts/scope.json` against `manifest.json` before trusting it as a merge or link-check base,
  so a hand-edited scope artifact is rejected with `ARTIFACT_HASH_MISMATCH` (or `ARTIFACT_UNREGISTERED`
  for a file that was never registered through the engine) on the very next mutation, instead of being
  silently built on. `qa validate` / `qa.validate` gains a `tamperedArtifacts` field that re-hashes
  every path `manifest.json` has ever registered and reports any that are missing or no longer match —
  catching tampering on artifacts nothing has mutated since, not only the ones a fresh `scope`/`cases add`
  call happens to touch. `qa validate` now exits with a failure code and prints a "tampered artifact(s)"
  section whenever `tamperedArtifacts` is non-empty.

  `@qa-ai-stlc/core` also fixes a latent bug where `scope.json` and case files were hashed into the
  manifest from a compact `JSON.stringify` while the file on disk was written in the canonical
  two-space, trailing-newline form (`toCanonicalJson`) — the two never matched, which would have made
  turning on manifest verification reject every legitimately engine-written artifact. Both paths now
  hash and write the exact same bytes. `ManifestStore` gains `readVerified`, a schema-validated read
  that throws instead of returning content that failed its hash check.

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
