# @qa-ai-stlc/mcp-server

## 1.6.1

### Patch Changes

- Updated dependencies [f6dd64c]
- Updated dependencies [05ec635]
- Updated dependencies [597ec65]
- Updated dependencies [3ef1938]
  - @qa-ai-stlc/core@1.6.1
  - @qa-ai-stlc/runner-playwright@1.6.1
  - @qa-ai-stlc/explorer@1.6.1
  - @qa-ai-stlc/runner-a11y@1.6.1
  - @qa-ai-stlc/runner-api@1.6.1
  - @qa-ai-stlc/schemas@1.6.1

## 1.6.0

### Minor Changes

- 32bdb52: Add an `a11y` config block: WCAG version (`2.0`, `2.1` or `2.2`, default `2.1`), cumulative conformance level (`A`, `AA` or `AAA`, default `AA`), best-practice rules (default off), include and exclude selectors, and known-issue exceptions with a rule id, a reason and an optional expiry. `qa init` (`--a11y-wcag-version`, `--a11y-level`, `--a11y-best-practices`) and `qa.init` (`a11y`) record the target when accessibility testing is in scope, and the `qa-start` skill asks for it.
- dfafb00: Add a per-criterion accessibility conformance section to `qa report` and `qa.report`, built from the recorded axe-core scans, and record the passed and inapplicable rules in the scan evidence.
- c3967a9: Add `qa api-diff` (MCP `qa.api_diff`): compares the OpenAPI 3.x contract named by `api.source` (a project file, an allowlisted URL, or `discover`, which probes the well-known spec paths with GET requests only) with the endpoints the last `qa explore` observed, and writes `selectors/api-diff.json` with each discrepancy classified as matched, undocumented, method not documented or unobserved, stamped with the contract's SHA-256. Path parameter names are ignored when comparing, so `/tasks/{taskId}` matches the observed `/tasks/{id}`.
- f664f1c: Generate API specs through the verification loop. For an `api` case, `qa.generation_spoke_input` returns `apiContract` (the contract operations the case names, plus the contract SHA-256) instead of a registry slice and locator module, and `qa.generation_verify` runs the spec through `runner-api`. A generated API spec must declare `export const CONTRACT_SHA256 = "<hash>"`: verification rejects a spec that does not match the input's hash, and `runner-api` rejects a spec once the live contract hashes differently (`API_SPEC_CONTRACT_CHANGED`). `registrySlice` and `locatorModule` are now optional in the spoke input schema and required only for non-`api` cases. The `qa-generate-tests` skill documents the API flow.
- 2e4885c: Add `qa.browser_attach`: attach to a Chrome the operator started with `--remote-debugging-port` and already signed into, as a browser session the `qa.browser_*` tools and `from-browser` API auth profiles can use. Only loopback endpoints are accepted, safe mode and the allowlist apply to the driven page only, and closing the session disconnects without closing the operator's browser.
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
- 1cc0c79: Add the defect-acceptance gate. `qa defect add --path <path>` (MCP `qa.defect_add`) registers a tracker-neutral defect draft under `artifacts/defects/<id>.json`, checking its requirement links against the scope and that every evidence path was registered by the engine. `qa defect accept <id> --approved-by <name>` (MCP `qa.defect_accept`) accepts it with an approval bound to the hash of the exact accepted content: a draft that claims `accepted` without an approval, or is edited afterwards, reads as `draft`.
- b5ee556: The browser action tools (`qa.browser_click`, `qa.browser_fill`, `qa.browser_select_option`, `qa.browser_set_date`, the popup tools and the grid tools) accept `ref` from the session's latest `qa.browser_snapshot` in place of `selector`; exactly one of the two is required (`BROWSER_TARGET_INVALID` otherwise). The engine resolves a ref to a role and exact-name selector, records that selector and the ref's role and name in the action evidence, and acts on the selector. A ref from an earlier snapshot, a ref used after a navigation or once the page URL changed, and a ref whose role and name no longer match exactly one element all fail with `BROWSER_REF_STALE`. Refs are numbered across the whole session, so one from an older snapshot is never mistaken for a new element. Action evidence gains an optional `ref` field.
- c7d5747: Data grids can be searched by content. `qa.browser_grid_find_row` finds the row with a given value under a column header and reads its cells; `qa.browser_grid_read_cell` returns one cell of that row. A grid with a pager is searched page by page (rewinding to its first page first), and a virtualized grid by scrolling it from the top, bounded by `maxSteps`. A value held by more than one rendered row is refused as `BROWSER_GRID_ROW_AMBIGUOUS` rather than guessed, a missing row is `BROWSER_GRID_ROW_NOT_FOUND`, and a missing header is `BROWSER_GRID_COLUMN_NOT_FOUND`. The Kendo UI for jQuery and Angular profiles declare their pager buttons and scroll container, and the evidence action types gain `grid-find-row` and `grid-read-cell`.
- 552493f: `qa.http_execute` takes `auth`, the name of an `apiAuth` profile, and the engine adds the credential itself. A raw `Authorization` or `Cookie` header, a header or query parameter that any profile declares, is now rejected with `HTTP_CREDENTIAL_INPUT_REJECTED` and a remediation pointing at profiles. OAuth tokens are cached for the life of the MCP server process.
- c4db737: `qa.browser_accessibility_scan` now runs axe-core against the configured `a11y` target: the WCAG version and cumulative level pick the rule tags (AAA rules are enabled explicitly, as axe-core disables them by default), best-practice rules are opt-in, and include/exclude selectors narrow the scan. `incomplete` results are reported as `uncertain`, violations covered by an unexpired exception are reported as `excepted` instead of dropped, and the evidence records the axe-core version and a hash of the effective `a11y` config.
- 088549c: MCP tools `qa.init`, `qa.config_set` and `qa.config_add` let the operator run the testing-scope survey and edit `.qa/config.yaml` inside the agent host. `qa.init` takes an explicit answer for every testing type (or an explicit `undecided`), returns the absolute project root for the operator to confirm before writing anything, and refuses when `.qa/` already exists in the directory or a parent. The MCP server now resolves the project root the way `qa-start` does: the nearest directory upward that holds `.qa/`. The `init`, `config set` and `config add` operations moved from the CLI into `@qa-ai-stlc/core`; the CLI commands behave as before.
- 4e43236: `qa.browser_select_option` also picks an option of a native by its visible text and checks the select shows it afterwards; a multi-select keeps what it already had chosen. An option the select does not have is `BROWSER_WIDGET_OPTION_NOT_FOUND`, and the error names the options it does have.
- ed23378: Add the `qa-rca` skill and its spoke contract. `qa.rca_input` (new) builds the input a root cause analysis is written from — the accepted defect, the cases covering its requirements, their run history, the defect's evidence (hash, size and a bounded excerpt of text evidence between untrusted-data markers) and the configured source location — from registered artifacts only, refusing evidence changed since registration. `RcaSchema` gains `evidencePaths` for the evidence the facts rest on, and `qa.rca_add` rejects any path the engine did not register (`RCA_EVIDENCE_UNREGISTERED`). The RCA Markdown lists its evidence.
- 87e1cca: Add the root cause analysis artifact and its review gate. `qa rca add --path <path>` (MCP `qa.rca_add`) registers an RCA under `artifacts/rca/<defect-id>.json` only for an accepted defect (`RCA_DEFECT_NOT_ACCEPTED` otherwise) and stamps the defect's hash on it (`defectSha256`, new optional field on `RcaSchema`); `qa rca approve <defect-id> --approved-by <name>` (MCP `qa.rca_approve`) records a review approval bound to the RCA's exact content. An approved RCA reads back as `draft` once the defect it explains changes. The RCA renders to Markdown with facts kept apart from hypotheses.
- 68f1be0: Add `@qa-ai-stlc/runner-a11y` and route `qa run --test-type a11y` (MCP `qa.run`) through it. An accessibility spec is an ordinary Playwright test that navigates and calls the generated `scanAccessibility(page, testInfo)` helper (`tests/qa/a11y-scan.ts`); the engine hands the helper the axe-core plan derived from the `a11y` configuration, registers each scan as `a11y-scan` evidence with exceptions applied, and sets the case's status from it: violations fail the case, `incomplete` results leave it `uncertain`, and a case that never scanned is rejected with `RUNNER_A11Y_NO_SCAN`. `qa run` and `qa.run` no longer answer `RUN_TEST_TYPE_UNSUPPORTED` for `a11y`.
- 210e92b: Add `@qa-ai-stlc/runner-api` and route `qa run --test-type api` (MCP `qa.run`) through it. Before any spec runs it loads the OpenAPI 3.x contract named by `api.source` and checks every case the spec declares: the case must be an `api` case listing the contract operations it exercises in the new optional `endpoints` field, and every one must exist in the contract, otherwise the run is rejected with `API_CASE_NOT_IN_CONTRACT` before a request is sent. The contract text is stored as `artifacts/api-contract.txt` and registered in the manifest. Contract loading and OpenAPI parsing move from the explorer into `@qa-ai-stlc/core` (`loadApiContract`), and contract URLs and discovery probes are now checked against the environment's scheme and port as well as its hostname.
- bea8a20: Add `safeNonGetRequests` to an environment (ADR-0014): named `POST` requests (exact path, written reason) that safe mode lets through in every safe-mode session, so an application that opens its session with a POST can be explored. `qa explore` and `qa.browser_close` list what was let through and what was blocked, by method and path; an entry only a local config layer adds is reported as a relaxation; `qa config add environment` takes `--allow-request` and `--allow-request-reason`, and no MCP tool can set the list.
- f1dc0fb: A `from-browser` auth profile reads its token where an operator would find it in developer tools: a cookie, a `localStorage` or `sessionStorage` key (with an optional JSON path) or the observed `Authorization`-style request header, from an open `qa.browser_open` session (`sessionId`) or, for cookies and `localStorage` only, from an identity's saved storage state (`identity`). Only allowlisted origins are read, a session of another environment is refused, the token is read on every call and never returned to the agent or stored in evidence.
- 29c8fdb: Add a `ui.componentLibrary` config setting (`none`, `kendo-jquery` or `kendo-angular`, default `none`). `qa init --component-library` and `qa.init` (`componentLibrary`) record the answer, the `qa-start` skill asks for it, and `qa config set ui.componentLibrary <value>` and `qa.config_set` change it later.

### Patch Changes

- 9ad51b1: Ship a README, LICENSE and NOTICE inside the generated Claude Code plugin folder so it passes the Claude plugin directory's validation.
- Updated dependencies [32bdb52]
- Updated dependencies [dfafb00]
- Updated dependencies [dc289ad]
- Updated dependencies [ac55857]
- Updated dependencies [a6bc034]
- Updated dependencies [d6dfc44]
- Updated dependencies [c3967a9]
- Updated dependencies [9fd9564]
- Updated dependencies [f664f1c]
- Updated dependencies [2e4885c]
- Updated dependencies [eb9580e]
- Updated dependencies [e0a6192]
- Updated dependencies [c649f7d]
- Updated dependencies [2338a38]
- Updated dependencies [18f524e]
- Updated dependencies [cc53150]
- Updated dependencies [35d621d]
- Updated dependencies [770cc78]
- Updated dependencies [8cf3406]
- Updated dependencies [953c27d]
- Updated dependencies [cd183b0]
- Updated dependencies [1cc0c79]
- Updated dependencies [f17c924]
- Updated dependencies [b5ee556]
- Updated dependencies [d956f25]
- Updated dependencies [c7d5747]
- Updated dependencies [552493f]
- Updated dependencies [4f67672]
- Updated dependencies [6846012]
- Updated dependencies [c4db737]
- Updated dependencies [088549c]
- Updated dependencies [4e43236]
- Updated dependencies [68de716]
- Updated dependencies [ed23378]
- Updated dependencies [87e1cca]
- Updated dependencies [06c0685]
- Updated dependencies [68f1be0]
- Updated dependencies [210e92b]
- Updated dependencies [bea8a20]
- Updated dependencies [f1dc0fb]
- Updated dependencies [29c8fdb]
- Updated dependencies [16cf78b]
- Updated dependencies [8b52efc]
  - @qa-ai-stlc/schemas@1.6.0
  - @qa-ai-stlc/core@1.6.0
  - @qa-ai-stlc/explorer@1.6.0
  - @qa-ai-stlc/runner-api@1.6.0
  - @qa-ai-stlc/runner-playwright@1.6.0
  - @qa-ai-stlc/runner-a11y@1.6.0

## 1.5.0

### Minor Changes

- 4da23d6: Add `qa config show [--explain]` and MCP `qa.config_show` (ADR-011): prints the effective configuration merged from `.qa/config.yaml` and its optional local layer, the local layer's path, and every relaxation it introduces. `--explain` also names the source layer (`committed`, `local` or a schema default) of every value. An identity's `secret` is always its environment-variable name; its value is never read or shown.
- 08972c0: `qa init` writes a commented `.qa/config.local.yaml.example` showing the optional local configuration layer's syntax (ADR-011). `qa doctor` / `qa.doctor` now report every relaxation the local layer introduces (a widened allowlist entry or `tlsInsecure: true`), the same way `qa config show` / `qa.config_show` already do — `DoctorReport` gains a `relaxations` field. README and CONTRIBUTING describe the configuration layers.
- a9488cb: `qa explore` / `qa.explore` now derives a discovered API surface from the crawl's own traffic and
  writes it to `.qa/selectors/endpoints.json`, merging with anything already stored there: every
  request is redacted, then collapsed onto a templated path (`/tasks/8213`, `/tasks/t-1` →
  `/tasks/{id}`) with a capped sample of the raw paths it was collapsed from. `qa.explore`'s result
  gains `endpointsPath` and `endpointCount`. `ApiEndpointSchema` (`@qa-ai-stlc/schemas`) gains an
  optional `examples` field to hold that sample.

### Patch Changes

- 1e2ab70: Move six project-specific engine constants into config (P6-23), each defaulting to its former hardcoded value so behavior does not change without config:

  - `selectors.stabilityViewports` — the viewports a locator candidate is scored at (was: desktop/tablet/mobile, unconditionally).
  - `selectors.defaultLoginSelectors` — the generic login-form selectors used when an identity's own `selectors` names none.
  - `selectors.extraStableAttributes` — attributes, beyond `testIdAttribute`, synthesized as an extra CSS candidate when an element carries one.
  - `selectors.generatedIdPatterns` — regular expressions an `id` is checked against before it is used as a CSS fallback candidate, so a framework-generated id (React's `useId`, a CSS-module hash) is never picked.
  - `environments.<name>.navigationTimeoutMs` / `actionTimeoutMs` — Playwright's navigation and action timeouts for `qa.browser_navigate`/`_click`/`_fill`, per ADR-011 a field of the environment rather than a generic overrides block.
  - `evidence.httpBodyPreviewMaxLength` — the cap on a stored HTTP response-body preview (`qa.http_execute`), was a hardcoded 4000.

  `navigationTimeoutMs`/`actionTimeoutMs` apply to the interactive `qa.browser_*` session only; explorer's own crawl, analysis and registry-build navigation, and scripted login, are unchanged and still use Playwright's default. `extraStableAttributes` is not available during manual pick mode, which has no live DOM read for an arbitrary attribute.

- 21e7319: `qa.generation_register` no longer trusts a verification outcome supplied by the caller. `qa.generation_verify` now records every outcome as an engine-written, manifest-registered verification record under `.qa/verifications/` and returns its `verificationId`; `qa.generation_register` takes the `spec` and that `verificationId` instead of `result` and `contentSha256`. Registration is rejected with a coded error when no such record exists, the record was edited, it did not end `verified`, it was already used, or the spec's test case, file path or content differ from what was verified. Verification also requires the test case to be registered and unchanged. `qa init` adds `/verifications/` to `.qa/.gitignore`.
- 84ed459: `qa.http_execute` no longer accepts a `tlsInsecure` input: certificate validation now follows the
  resolved environment's `tlsInsecure` in `config.yaml`, the same as `qa.browser_open`. Previously a
  caller could disable validation for any call to an allowlisted host, and an environment configured
  with `tlsInsecure: true` was not honored for HTTP calls unless the caller repeated it. A warning is
  logged when the environment disables validation. `runHttpExecute`'s `tlsInsecure` option is removed.
- Updated dependencies [4da23d6]
- Updated dependencies [1e2ab70]
- Updated dependencies [21e7319]
- Updated dependencies [84ed459]
- Updated dependencies [08972c0]
- Updated dependencies [434e07f]
- Updated dependencies [891c692]
- Updated dependencies [a9488cb]
- Updated dependencies [16b80d4]
- Updated dependencies [fbbbab7]
  - @qa-ai-stlc/core@1.5.0
  - @qa-ai-stlc/schemas@1.5.0
  - @qa-ai-stlc/explorer@1.5.0
  - @qa-ai-stlc/runner-playwright@1.5.0

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

- Updated dependencies [97a57f7]
  - @qa-ai-stlc/core@1.4.0
  - @qa-ai-stlc/explorer@1.4.0
  - @qa-ai-stlc/runner-playwright@1.4.0
  - @qa-ai-stlc/schemas@1.4.0

## 1.3.0

### Minor Changes

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
- Updated dependencies [6d5c9da]
- Updated dependencies [efb7692]
- Updated dependencies [ddd1bcd]
- Updated dependencies [6c06b46]
- Updated dependencies [535e2e9]
- Updated dependencies [592d606]
- Updated dependencies [671249f]
  - @qa-ai-stlc/core@1.3.0
  - @qa-ai-stlc/schemas@1.3.0
  - @qa-ai-stlc/runner-playwright@1.3.0
  - @qa-ai-stlc/explorer@1.3.0

## 0.7.0

### Minor Changes

- d1c700a: Exposes P3-14's interactive case execution operations over MCP, so an agent host can actually
  drive them (they previously existed only in `@qa-ai-stlc/core`, unreachable from any host):

  - `qa.browser_open` gains the `executionMode` option (ADR-0009), previously core-only.
  - New tools: `qa.http_execute` (a real HTTP call for the `api` test type), `qa.browser_accessibility_scan`
    (a real axe-core scan for `a11y`), `qa.registry_execute_register` (promotes an ad hoc element pick
    into the selector registry as `source: "execute"`), and `qa.case_result_register` (ties an
    execution's evidence together into a registered run result; the caller supplies the pass/fail
    verdict, never the engine).

  Backs the new `qa-execute` skill (P3-15, `agents/skills/qa-execute/`), which drives these tools to
  prove an approved test case actually works before any code is generated for it.

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

### Patch Changes

- e0603c1: Fixes `qa.http_execute` (#364): it made a real HTTP call to any URL it was given, with no check
  against the environment's configured domain allowlist — the only `qa.browser_*`-adjacent tool that
  didn't. `runHttpExecute` now resolves the environment (a new optional `environment` option, same
  lookup `qa.browser_open` already uses) and rejects a URL off its allowlist with
  `BROWSER_URL_NOT_ALLOWED` before making any request. This restricts which host can be called, never
  which method: a real POST/PUT/DELETE against an allowed host still works, exactly as `api`
  test-type execution requires.
- Updated dependencies [8ec2ace]
- Updated dependencies [30446d2]
- Updated dependencies [9a5b1fe]
- Updated dependencies [e0603c1]
- Updated dependencies [344852d]
- Updated dependencies [72ebb8e]
- Updated dependencies [9380d0d]
- Updated dependencies [1ff0e16]
- Updated dependencies [43c1c0e]
- Updated dependencies [d72dc03]
- Updated dependencies [1775c76]
- Updated dependencies [71c360e]
  - @qa-ai-stlc/schemas@1.1.0
  - @qa-ai-stlc/core@1.2.0
  - @qa-ai-stlc/runner-playwright@0.2.0
  - @qa-ai-stlc/explorer@1.0.3

## 0.6.0

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

### Patch Changes

- Updated dependencies [47ce6c6]
  - @qa-ai-stlc/core@1.1.0
  - @qa-ai-stlc/explorer@1.0.2

## 0.5.1

### Patch Changes

- Updated dependencies [3590f7a]
- Updated dependencies [af2f3da]
  - @qa-ai-stlc/schemas@1.0.1
  - @qa-ai-stlc/explorer@1.0.1
  - @qa-ai-stlc/core@1.0.1

## 0.5.0

### Minor Changes

- 574705e: Add the engine/plugin version handshake (P2-12, ADR-007): the generated Claude Code plugin's
  `.mcp.json` now pins the engine version it expects into `QA_EXPECTED_ENGINE_VERSION`. At start,
  the MCP server compares that against its own version and, on a mismatch, exits with a coded
  `ENGINE_VERSION_MISMATCH` error and a remediation instead of silently running a different engine
  version than the plugin was generated against. A server started without that variable set (for
  example directly from the CLI during development) is unaffected.
- d1b29ee: Add reusable, non-secret test-data sets (P2-22): `TestDataSchema` (`packages/schemas`) is a named
  set of key/value variables, and `TestCaseSchema` gains an optional `testDataRefs` array so a case's
  steps or preconditions can reference shared values by id instead of inlining them.

  `qa test-data add` / `qa.test_data_add` validates a set and registers it under
  `artifacts/test-data/<feature>/<id>.json` (P2-20's feature-folder convention). `qa validate` now
  also rejects a case whose `testDataRefs` entry does not resolve to a registered set, reported as a
  new `unresolvedTestData` field on the validate report — both are additive, so nothing existing
  changes shape.

  Never holds credentials — those stay in identities / `QA_*` environment variables.

### Patch Changes

- adaa974: Fix `qa validate`/`qa.validate` reporting every binary evidence artifact (screenshots, traces,
  video) as tampered, even freshly registered and untouched. `EvidenceStore` hashes binary content
  byte-for-byte (`hashBytes`); the tamper check re-read every manifest-registered path through a
  lossy UTF-8 text decode regardless of that, so a re-hash could never match.

  `ManifestStore` gains `verifyContent(relativePath, rawBytes)`: since the manifest does not record
  which hasher an entry used, it checks raw bytes against both a binary hash and a text hash of
  their UTF-8 decoding, which is strictly more correct than assuming one encoding. The `FileSystem`
  port gains a required `readBytes(absolutePath)` method (breaking for a custom implementation) so
  the tamper check can read a file without assuming its encoding ahead of time.

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
- Updated dependencies [185e50e]
- Updated dependencies [adaa974]
- Updated dependencies [bb0a0aa]
- Updated dependencies [81bf690]
- Updated dependencies [6d8ac0a]
- Updated dependencies [e288603]
- Updated dependencies [2334df3]
- Updated dependencies [2235987]
- Updated dependencies [c1f4de6]
- Updated dependencies [e968493]
- Updated dependencies [1f205dd]
- Updated dependencies [c7a5c3d]
- Updated dependencies [6c1ba4f]
- Updated dependencies [22d0436]
- Updated dependencies [e1f1308]
- Updated dependencies [d1b29ee]
- Updated dependencies [71bbbf7]
- Updated dependencies [f44a75b]
  - @qa-ai-stlc/schemas@1.0.0
  - @qa-ai-stlc/core@1.0.0
  - @qa-ai-stlc/explorer@1.0.0

## 0.4.0

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

### Patch Changes

- Updated dependencies [0e329ac]
  - @qa-ai-stlc/core@0.11.0
  - @qa-ai-stlc/explorer@0.7.2

## 0.3.0

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
  - @qa-ai-stlc/core@0.10.0
  - @qa-ai-stlc/explorer@0.7.1

## 0.2.0

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
  - @qa-ai-stlc/explorer@0.7.0

## 0.1.2

### Patch Changes

- Updated dependencies [554ec6d]
  - @qa-ai-stlc/schemas@0.8.0
  - @qa-ai-stlc/core@0.8.0

## 0.1.1

### Patch Changes

- Updated dependencies [859a980]
  - @qa-ai-stlc/core@0.7.0

## 0.1.0

### Minor Changes

- b218ce9: Add `@qa-ai-stlc/mcp-server`, the local stdio MCP server: `qa-mcp-server` starts it. `ToolDefinition` pairs a Zod input and output schema with a handler that returns a value matching the output schema or throws — a `QaError` for an expected failure, anything else for a bug. `registerTool` turns a thrown error into a structured `CallToolResult` carrying a stable `code` and, when there is one, a `remediation`, never a raw stack trace; invalid tool input is rejected automatically by the registered Zod schema before the handler runs. Ships with one built-in tool, `qa.ping`, a health check. Calls no model itself.
