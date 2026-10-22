# @qa-ai-stlc/cli

## 1.13.0

### Minor Changes

- ad5e756: An element id no longer contains the origin of its page: it is made from the environment's name and the page's path. The same environment served on another port, for example through a local configuration file, now gets the same ids, so the registry, the locator module and the generation stamps stop differing between machines. Elements already in the registry are re-keyed, with their names and history, the next time their environment is explored. The locator module and the generation stamps change once, in that run.
- b1c61d1: An environment can pin the language of its browser contexts with `locale`, a BCP 47 tag such as `en-US`. Exploring, picking, the interactive browser session, signing in, and running or verifying a generated spec all use it, so the text of the application, and with it element names and text locators, no longer depends on the machine running the engine. Set it with `qa config add environment --locale <tag>` or the `locale` input of `qa.config_add`; an invalid tag is rejected. Leaving it out keeps today's behavior: the machine's own language applies, so existing projects are unchanged. The security audit's sign-in still uses the machine's language.

### Patch Changes

- 9f40a76: A scripted sign-in now checks its login page against the environment allowlist on every path. Before, only `qa run` and the security audit did, so exploring or opening a browser session could send an identity's password to a page outside the allowlist.
- Updated dependencies [ad5e756]
- Updated dependencies [b1c61d1]
- Updated dependencies [5cc4ac7]
- Updated dependencies [626f41c]
- Updated dependencies [9f40a76]
- Updated dependencies [f114d37]
- Updated dependencies [4a5d087]
- Updated dependencies [df9e6bf]
  - @qa-ai-stlc/core@1.13.0
  - @qa-ai-stlc/explorer@1.13.0
  - @qa-ai-stlc/schemas@1.13.0
  - @qa-ai-stlc/runner-playwright@1.13.0
  - @qa-ai-stlc/runner-security@1.13.0
  - @qa-ai-stlc/runner-a11y@1.13.0
  - @qa-ai-stlc/runner-api@1.13.0

## 1.12.1

### Patch Changes

- eecace0: An allowlist entry may now name a port (ADR-0019). `localhost:8091` admits that host on exactly that port; a bare `localhost` still admits it on the port of `baseUrl` only. Before, an application served from one port that read its data from an API on another (an interface on `:4200`, its API on `:8091`) was explored without its data, because every call to the API was blocked and no setting could allow it. List both entries, `[localhost, localhost:8091]`: a port entry does not admit the port of `baseUrl` on its own, and the scheme of `baseUrl` still applies to every entry. One function now decides for the browser, the HTTP tools, the runners and the explorer, and the explorer's crawl filter and the cookie check read the host of an entry. The explore report names the entry that would admit a blocked port (`host:port`). The operator adds a port entry in `config.yaml` or with `qa config add environment`; `qa.config_add` refuses one with `CONFIG_ALLOWLIST_PORT_NOT_SETTABLE`, and an entry that only the local layer adds is reported as a relaxation. An entry with a path or a scheme is still rejected.
- 06816a0: `qa explore` and `qa.browser_close` now say why safe mode blocked a request. The summary used to count every blocked request as `non-GET`, so a plain `GET` to an API on another port (an allowlisted host on a different port) was reported as a mutation and the hint pointed at `safeNonGetRequests`, which cannot help. Each blocked request now carries a reason: `method` (not a `GET`), or `host`, `scheme` or `port` (it left the environment's allowlist or `baseUrl`). `qa explore` prints a line per reason and a separate list with a hint that fits it: only a blocked method points at `safeNonGetRequests`; a blocked origin points at the allowlist and `baseUrl`. `qa.explore` returns `blockedRequestCounts` (complete, unlike the capped listing) and a `reason` on each blocked entry; `qa.browser_close` returns a `reason` on each blocked request and `blockedCounts`. A request off the allowlist is reported by its origin whatever its method. Pick mode now sums the complete counts instead of the capped listing. The `qa-explore` skill reads the reason before advising.
- d535bda: Exploring a second environment no longer disturbs the first one's elements (ADR-0020). The project has one selector registry and one API surface however many environments it lists, and a crawl of the second used to report the first environment's elements as `removed` and to mark them deprecated, which also made `--verify` skip them. A registry element and an endpoint now name their environment (an optional field, so existing files stay valid and need no migration). A run replaces, deprecates, renames, verifies and counts only the elements of its own environment, leaves the others as they were, and says how many it left (`otherEnvironmentElementCount`, and a line in the explore summary). An element stored without an environment is read as belonging to the environment whose address rules admit its page, or to every environment when it has no page, and is claimed as it is explored again. No name of an element left alone is given to a new one, so the single locator module keeps unique function names. Generation and generated-spec verification offer only the elements of the spec's environment, `qa api-diff` compares the contract with the endpoints of its environment, and an element registered from a browser session is recorded under the session's environment. A call to `qa.generation_spoke_input` for an `e2e` case now has to name the environment when the project has more than one, as it already did for an `api` case.
- 4dc2110: Safe mode now lets the safe HTTP methods through, not only `GET`: `GET`, `HEAD`, `OPTIONS` and `QUERY` (ADR-0018). An application that reads with `QUERY` (a read whose parameters travel in a request body, as a product search or a category tree often does) used to load nothing during exploration, because safe mode aborted every `QUERY` request as a mutation and `safeNonGetRequests` accepts `POST` only. The comparison is exact and case-sensitive, `TRACE` stays blocked, and every other method (`POST`, `PUT`, `PATCH`, `DELETE`) is aborted as before. The domain allowlist still applies to every request. The browser safe-mode handler and the security probe now share one definition of a safe method (`SAFE_HTTP_METHODS` in `@qa-ai-stlc/core`), so the two can no longer disagree; the security probe now also sends a `QUERY` request without an authorization entry. A `QUERY` request that goes through is not yet recorded as an endpoint in `endpoints.json` or compared with the OpenAPI contract, which do not know the method.
- Updated dependencies [eecace0]
- Updated dependencies [06816a0]
- Updated dependencies [54311ad]
- Updated dependencies [1d82f20]
- Updated dependencies [d535bda]
- Updated dependencies [4dc2110]
  - @qa-ai-stlc/schemas@1.12.1
  - @qa-ai-stlc/core@1.12.1
  - @qa-ai-stlc/explorer@1.12.1
  - @qa-ai-stlc/runner-security@1.12.1
  - @qa-ai-stlc/runner-api@1.12.1
  - @qa-ai-stlc/runner-playwright@1.12.1
  - @qa-ai-stlc/runner-a11y@1.12.1

## 1.12.0

### Minor Changes

- 0f640f2: The `qa-regression` skill and `qa.regression_plan` (also `qa regression plan --max-tier <tier>`). The engine selects the regression pack for a tier threshold (smoke, critical-path, regression, extended: a pack takes every tier up to the one named) from the registered cases, the run history and the verifications it holds: an approved case is in when its tier is at or below the threshold and its history is not flaky by the configured thresholds, and every case that is out carries its reason (`not-approved`, `no-tier`, `tier-above-threshold`, `flaky`). Each case in is routed to its verified generated spec (grouped for `qa.run`, one call per test type) or to live execution with the reason there is no spec (`no-verified-spec`, `stale-spec`, `spec-changed`). The skill shows the plan, asks before live execution, runs both routes and says what came back.
- e45a829: The reviewer spoke. `qa.review_input` gives it a registered spec, its case, the verification that let it be registered and, for each `expect(...)`, what the engine found: `tautology` (the assertion is about a literal, so it holds whatever the application does), `inline-locator`, `unknown-locator` and `ungrounded-value` (an expected value neither the case nor its proven session contains). The author's reasoning is not part of it. `qa.review_add` (also `qa review add --path`) registers the verdict under `artifacts/reviews/<case-id>.json`, bound to the spec's exact content; the engine refuses an approval with an error finding (`REVIEW_APPROVAL_BLOCKED`), a warning with no reasoned waiver (`REVIEW_WARNING_NOT_WAIVED`) and a waiver for a finding it does not raise. `reviewer` joins the spoke definitions (contract and generated `qa-reviewer` subagent, `agents.models.reviewer`).
- ea67629: `qa.run_metrics` (and `qa metrics [--run <run-id>]`) says how a run of the agent layer was carried out, read from the spoke I/O store and the `agents` budgets only: tasks, attempts and valid, error and unanswered responses per spoke, retries used against `agents.retries`, wall-clock and busy time, the time overlapping attempts saved, attempts that timed out, and the most attempts running at once against `agents.parallelism`. It has no token count or cost: the engine reads no host transcript.
- 31e0dca: `qa.spec_check` (and `qa spec check --spec <path>`) runs a spec set through its runner and says what each test did (status, a capped failure message between untrusted-data markers, missing steps) without recording anything: no run record, result file, evidence or manifest entry, so it changes neither `qa report` nor the history that flaky detection and triage read. The reviewer subagent is now told to check a spec with it instead of `qa.run`, so a review no longer adds a run.
- 4b76336: `agents.models` in `.qa/config.yaml` routes each spoke (`explorer`, `test-design`, `case-execution`, `test-generation`, `qa-rca`) to a model, and `qa agents generate` writes one Claude Code subagent per spoke into `.claude/agents/`, each with that `model:` (`inherit` when none is set). It rewrites only files it generated and refuses a file of the same name it did not (`AGENTS_FILE_NOT_GENERATED`). The explorer, test-design, case-execution and test-generation spokes get contract files in `agents/hub/spokes/`, next to `qa-rca`. Hosts whose subagents take no model ignore the setting.
- 00fe126: The triage spoke: `qa.triage_input` gives it every failed result of a run with the failure message, a `failureKind` hint read off it (network, locator-not-found, assertion-mismatch, other), the registered evidence, the case's history across runs and whether the configured flaky thresholds call it flaky. `qa.triage_add` (also `qa triage add --path`) registers its classification under `artifacts/triage/<run-id>.json`: product bug, flaky, stale selector, environment or uncertain, each with a confidence and reasons. The engine refuses a failure left out, one classified twice, evidence that is not the result's, and `flaky` for a case whose history is not flaky. `triage` joins the spoke definitions, so it gets a contract and a generated subagent (`agents.models.triage`).

### Patch Changes

- 7fb6c83: Spokes dispatched in parallel on Claude Code no longer lose each other's writes. The store has `withLock`, a lock under `.qa/locks/` that waits for the holder and takes over one left by a process that died (`STORE_LOCK_TIMEOUT` after 30 seconds). The manifest, the case indexes, the selector registry and a run's spoke records are written under it, so parallel registrations, case designs, explorations and dispatches (`SPOKE_PARALLELISM_EXCEEDED` is now exact under concurrency) all survive. Files are saved whole through a temporary file and a rename, so a reader never sees half of one. `persistExploreResult` reads the registry it merges into inside the lock, and no longer takes it as an argument. The hub definition says when it may dispatch spokes in parallel.
- dd86e85: The `qa-metrics` skill answers questions about how a run of the agent layer was carried out ("how did the agent run go", "how many retries did we use", "did we stay within the parallelism budget") by relaying `qa.run_metrics`, and says that tokens and cost are not measured instead of estimating them. `qa.run_metrics` now also returns `markdown`, the same figures rendered by the engine (seconds converted and formatted once), which the skill relays as it is; `qa metrics` prints that rendering.
- Updated dependencies [0d13f55]
- Updated dependencies [7394fac]
- Updated dependencies [7a61e80]
- Updated dependencies [d93192f]
- Updated dependencies [7fb6c83]
- Updated dependencies [62bc410]
- Updated dependencies [dd86e85]
- Updated dependencies [0f640f2]
- Updated dependencies [d75a9a5]
- Updated dependencies [e45a829]
- Updated dependencies [ea67629]
- Updated dependencies [3d51e7e]
- Updated dependencies [31e0dca]
- Updated dependencies [7a61e80]
- Updated dependencies [4b76336]
- Updated dependencies [00fe126]
- Updated dependencies [1a5e8e2]
- Updated dependencies [40cbef8]
  - @qa-ai-stlc/schemas@1.12.0
  - @qa-ai-stlc/core@1.12.0
  - @qa-ai-stlc/explorer@1.12.0
  - @qa-ai-stlc/runner-api@1.12.0
  - @qa-ai-stlc/runner-playwright@1.12.0
  - @qa-ai-stlc/runner-security@1.12.0
  - @qa-ai-stlc/runner-a11y@1.12.0

## 1.11.0

### Minor Changes

- 2087fda: `qa report --output [path]` and the `output` input of `qa.report` save a Markdown run-result report to the project. It is rendered from the engine's own data: a case table with status, finish time, evidence count and result id, the failure reasons, the `qa run` executions of generated specs, the accessibility conformance counts, the defects with the status their approval supports and the approved root cause analyses. A section with nothing to show is omitted, `blocked`, `skipped`, `uncertain` and `partial` keep their own names, and evidence is counted, never inlined. The default path is `artifacts/reports/run-result-<date>.md`; the result returns the path written. The `qa-report` skill points the operator to the saved file.

### Patch Changes

- Updated dependencies [ff04ffd]
- Updated dependencies [b67fcb5]
- Updated dependencies [c874bfb]
- Updated dependencies [2087fda]
- Updated dependencies [a55b57f]
  - @qa-ai-stlc/schemas@1.11.0
  - @qa-ai-stlc/core@1.11.0
  - @qa-ai-stlc/explorer@1.11.0
  - @qa-ai-stlc/runner-api@1.11.0
  - @qa-ai-stlc/runner-playwright@1.11.0
  - @qa-ai-stlc/runner-security@1.11.0
  - @qa-ai-stlc/runner-a11y@1.11.0

## 1.10.0

### Minor Changes

- c0e163c: Explore can now register what a page keeps out of sight or does not mark as interactive. `qa explore --expand-collapsed` (MCP `expandCollapsed`) opens each page's collapsed panels (`aria-expanded="false"` controls that are not links, submit buttons or pop-up triggers, plus a component library profile's own selectors) in a throwaway context under safe mode, and registers the filter inputs that appear; the report gives `expandedPanelCount`. Scoring and `--verify` reopen the panels after each reload, so those controls resolve. Elements that carry the configured test id and look operable (a sortable header, a status chip) are registered with the new kind `element`, and the Kendo UI for Angular profile registers a grid header cell under its title. `--probe-navigation` also clicks `role="button"` elements; a bare `div`, an anchor without `href` and a button inside a form are still skipped.
- 5995057: Pick mode can now reach a control behind a collapsed panel. Its click capture swallows every click on an interactive element, so a toggle such as a "Search Details" button was recorded but never opened and the filter inputs inside it could not be picked. The toolbar has a **Browse** switch: while it is on, clicks go to the page and are not captured; switch it off and click the element to capture it. Because browsing lets a click act on the page, the pick-mode session now runs under safe mode's network rules: every non-GET request and every request off the environment allowlist is aborted (a `POST` the environment lists in `safeNonGetRequests` is let through), and the report lists what was blocked. `--pick <url>` refuses a page that is not on the allowlist of the resolved environment (`explorer.pick_mode.url_not_allowed`); with no environment, only the picked page's own host is allowed.

### Patch Changes

- 4810691: An api spec whose `apiAuth` profile reads its token from a browser session (`from-browser`) can now be verified and run. `qa.generation_verify` and `qa run` used to end in `API_AUTH_SESSION_REQUIRED` because nothing gave them a session. They now sign in as the run's identity (the `identity` argument, else the environment's `identity`) in a headless session under safe mode, load the environment's base URL, read the cookie, localStorage or sessionStorage key or request header the profile names, and close the session before the specs start; the token never reaches a spec, a log or a report. A run with no identity still stops with `API_AUTH_SESSION_REQUIRED`, and the remediation now names the identity. The run record names an identity only for runners that sign the specs in, so an api run does not claim a browser sign-in.
- b10a724: An element an agent added from a live session (`qa.registry_execute_register`) is no longer deprecated by the next `qa explore`. The crawl cannot see such elements (a collapsed panel, a header or chip that is not natively interactive), so missing one says nothing about it being gone; it used to be marked deprecated and then left out of `tests/qa/locators.ts`, so a spec could not import it. A crawl that misses a session-added element also no longer counts it as removed, and `qa explore --verify` now resolves the `execute` strategy instead of failing with `locator-strategy-unknown`. An element that is not found on a fresh page load (revealed only after an interaction) is reported as degraded.
- Updated dependencies [4810691]
- Updated dependencies [ad08f4a]
- Updated dependencies [c0e163c]
- Updated dependencies [5aab58c]
- Updated dependencies [d2ede91]
- Updated dependencies [5995057]
- Updated dependencies [b10a724]
  - @qa-ai-stlc/core@1.10.0
  - @qa-ai-stlc/runner-api@1.10.0
  - @qa-ai-stlc/schemas@1.10.0
  - @qa-ai-stlc/explorer@1.10.0
  - @qa-ai-stlc/runner-a11y@1.10.0
  - @qa-ai-stlc/runner-playwright@1.10.0
  - @qa-ai-stlc/runner-security@1.10.0

## 1.9.0

### Minor Changes

- b9e9efc: The agent can now set up API authentication without the operator editing `config.yaml`. `qa.config_add_api_auth` (and `qa config add api-auth <name> --profile <json> [--default-for <environment>]`) adds an `apiAuth` profile and an environment default, validated by the same schema; a secret is only ever the name of a `QA_` variable, so a token value is refused. `qa.browser_discover_api_auth` reads an open, signed-in session and reports which request header carries the bearer token and which cookie, localStorage or sessionStorage key stores it, as names only, with a proposed `from-browser` profile. For this, a session now keeps in memory the latest `Authorization` and bearer-valued request headers sent to allowlisted hosts; they are never returned or logged. `qa-execute` says to use these instead of asking the operator for YAML.
- 2c0a81f: The security audit that `runner-security` can run is now reachable on demand. `qa security authorize --path <file>`, `qa security approve --approved-by <name>` and `qa security audit` (and the MCP tools `qa.security_authorize`, `qa.security_approve`, `qa.security_audit`) register the audit authorization, record the operator's approval of its exact content, and run the authorized checks, filing every finding as a defect draft that is not accepted. All three refuse with `SECURITY_OUT_OF_SCOPE` unless `testing.security` is `in-scope`, and the audit refuses to start without an approved, current authorization. The new `qa-security` skill drafts the authorization, puts it in front of the operator, waits for their approval and reports the result; it fires only on a request for a security audit and is never called by the pipeline. `qa security audit` exits non-zero when it found something or stopped early.
- 48f9f7d: `qa report` and `qa.report` now report the results `qa-execute` registered, not only `qa run` records. A session that executed cases but never ran a spec set no longer ends in `REPORT_NO_RUNS`: the new `interactiveSummary` lists one row per case (its latest result, with an honest status) and the traceability matrix already covered both. `runId`, `runRecordPath` and `runSummary` are now present only when a `qa run` record is reported, and `--run <id>` also accepts the id of a live execution run. `REPORT_NO_RUNS` now means neither kind of result exists.
- 6e64902: Browser specs can now run against a site that needs sign-in. `qa run`, `qa.run` and `qa.generation_verify` sign in as a configured identity and start the browser with its session, so a spec carries no credential and no login steps. The identity is `--identity` / `identity` on the call, else the new `environments.<name>.identity` in `config.yaml`; with neither the run is anonymous. The run record, the run summary and the verification result name the identity used. The session exists only for the run (traces are off for it) and is never written to a report, log or artifact. A login that does not take stops the run with `RUN_SIGN_IN_FAILED` and a remediation, instead of running the specs against the login page; an unknown identity is `RUN_IDENTITY_UNKNOWN`.

### Patch Changes

- Updated dependencies [b9e9efc]
- Updated dependencies [cd6d619]
- Updated dependencies [26818b4]
- Updated dependencies [d75348b]
- Updated dependencies [afa3690]
- Updated dependencies [6cbe958]
- Updated dependencies [2c0a81f]
- Updated dependencies [48f9f7d]
- Updated dependencies [6e64902]
- Updated dependencies [edbb652]
- Updated dependencies [8a00424]
  - @qa-ai-stlc/core@1.9.0
  - @qa-ai-stlc/explorer@1.9.0
  - @qa-ai-stlc/runner-security@1.9.0
  - @qa-ai-stlc/schemas@1.9.0
  - @qa-ai-stlc/runner-playwright@1.9.0
  - @qa-ai-stlc/runner-a11y@1.9.0
  - @qa-ai-stlc/runner-api@1.9.0

## 1.8.0

### Minor Changes

- b1d0516: Every registered test case now has a readable Markdown copy with its preconditions, steps and expected result at `artifacts/cases-md/<feature>/<id>.md`, written when the case is added or linked and registered in the manifest. `qa cases add` and `qa.cases_add` return its path as `markdownPath`, and the feature index Markdown links to each copy, so cases can be reviewed before approving the `cases` gate without reading JSON.
- c0707e2: API testing can be turned on after `qa init`: `qa config set testing.api in-scope --api-source <file, URL, discover or synthesize>` (and `apiSource` on `qa.config_set`) writes the `api` section with the scope change. Without a source the call fails with `CONFIG_SET_API_SOURCE_REQUIRED` and says how to give one. Switching `testing.api` off again keeps the `api` section.
- 8e41570: The crawl can start from operator-given pages, not only `baseUrl`: `qa explore --url <url-or-path>` (repeatable) and the `startUrls` input of `qa.explore`. Each must be on the environment allowlist.
- 940b19d: New `qa status` command and `qa.status` tool: the pipeline gates plus an ordered list of next actions. Once the last gate (`cases`) is approved it names what follows outside the pipeline: exploring the application, executing approved cases that have no passing result, and generating tests for passing ones, each with the skill and first tool to use. The hub and `qa-start` relay it instead of saying nothing comes next.
- 48e3c2f: The crawl finds single-page-application routes that have no `<a href>`: it reads `routerLink`, `ng-reflect-router-link` and `data-href` attributes and the URLs a page pushes through the History API. With `qa explore --probe-navigation` (`probeNavigation` on `qa.explore`) it also clicks buttons outside forms, each in a throwaway context under safe mode, and keeps the page a click led to (ADR-0015). The route map records how each route was found (`router-attribute`, `history-api`, `click-probe`).

### Patch Changes

- daf89be: The `qa-explore` skill now gives the exact pick-mode command (`npx @qa-ai-stlc/cli explore --pick <url>`, or `npx qa explore --pick <url>` when installed) and tells the agent to add `--identity` for a page behind sign-in.
- 00d3d15: `qa explore --pick` brings the pick-mode toolbar back after a login redirect or any other navigation, and reports a closed window as `explorer.pick_mode.page_closed` instead of a raw Playwright error.
- Updated dependencies [585653b]
- Updated dependencies [6160291]
- Updated dependencies [b1d0516]
- Updated dependencies [c1f6ed4]
- Updated dependencies [e78749c]
- Updated dependencies [c0707e2]
- Updated dependencies [8e41570]
- Updated dependencies [00d3d15]
- Updated dependencies [940b19d]
- Updated dependencies [48e3c2f]
- Updated dependencies [dafa6ab]
  - @qa-ai-stlc/core@1.8.0
  - @qa-ai-stlc/explorer@1.8.0
  - @qa-ai-stlc/schemas@1.8.0
  - @qa-ai-stlc/runner-a11y@1.8.0
  - @qa-ai-stlc/runner-api@1.8.0
  - @qa-ai-stlc/runner-playwright@1.8.0

## 1.7.0

### Patch Changes

- Updated dependencies [f6dd64c]
- Updated dependencies [05ec635]
- Updated dependencies [597ec65]
- Updated dependencies [62612a1]
- Updated dependencies [2663897]
- Updated dependencies [3691ab0]
- Updated dependencies [3ef1938]
  - @qa-ai-stlc/core@1.7.0
  - @qa-ai-stlc/schemas@1.7.0
  - @qa-ai-stlc/runner-playwright@1.7.0
  - @qa-ai-stlc/explorer@1.7.0
  - @qa-ai-stlc/runner-a11y@1.7.0
  - @qa-ai-stlc/runner-api@1.7.0

## 1.6.0

### Minor Changes

- 32bdb52: Add an `a11y` config block: WCAG version (`2.0`, `2.1` or `2.2`, default `2.1`), cumulative conformance level (`A`, `AA` or `AAA`, default `AA`), best-practice rules (default off), include and exclude selectors, and known-issue exceptions with a rule id, a reason and an optional expiry. `qa init` (`--a11y-wcag-version`, `--a11y-level`, `--a11y-best-practices`) and `qa.init` (`a11y`) record the target when accessibility testing is in scope, and the `qa-start` skill asks for it.
- dfafb00: Add a per-criterion accessibility conformance section to `qa report` and `qa.report`, built from the recorded axe-core scans, and record the passed and inapplicable rules in the scan evidence.
- c3967a9: Add `qa api-diff` (MCP `qa.api_diff`): compares the OpenAPI 3.x contract named by `api.source` (a project file, an allowlisted URL, or `discover`, which probes the well-known spec paths with GET requests only) with the endpoints the last `qa explore` observed, and writes `selectors/api-diff.json` with each discrepancy classified as matched, undocumented, method not documented or unobserved, stamped with the contract's SHA-256. Path parameter names are ignored when comparing, so `/tasks/{taskId}` matches the observed `/tasks/{id}`.
- 953c27d: Add the component-library profile mechanism to the explorer. A profile selected by `ui.componentLibrary` is data: widget recognizers (a DOM signature, the widget kind and ARIA role, and the hidden native controls that only back the widget), generated-id patterns that locator synthesis rejects, and busy indicators the explorer waits out before reading a page. A recognized widget is registered on its visible wrapper as one element, with its widget kind, library and the popup it opens (read from `aria-controls`/`aria-owns`, since the popup is usually attached to `body`). No library profile ships yet; the Kendo profiles follow.
- 1cc0c79: Add the defect-acceptance gate. `qa defect add --path <path>` (MCP `qa.defect_add`) registers a tracker-neutral defect draft under `artifacts/defects/<id>.json`, checking its requirement links against the scope and that every evidence path was registered by the engine. `qa defect accept <id> --approved-by <name>` (MCP `qa.defect_accept`) accepts it with an approval bound to the hash of the exact accepted content: a draft that claims `accepted` without an approval, or is edited afterwards, reads as `draft`.
- 088549c: MCP tools `qa.init`, `qa.config_set` and `qa.config_add` let the operator run the testing-scope survey and edit `.qa/config.yaml` inside the agent host. `qa.init` takes an explicit answer for every testing type (or an explicit `undecided`), returns the absolute project root for the operator to confirm before writing anything, and refuses when `.qa/` already exists in the directory or a parent. The MCP server now resolves the project root the way `qa-start` does: the nearest directory upward that holds `.qa/`. The `init`, `config set` and `config add` operations moved from the CLI into `@qa-ai-stlc/core`; the CLI commands behave as before.
- 87e1cca: Add the root cause analysis artifact and its review gate. `qa rca add --path <path>` (MCP `qa.rca_add`) registers an RCA under `artifacts/rca/<defect-id>.json` only for an accepted defect (`RCA_DEFECT_NOT_ACCEPTED` otherwise) and stamps the defect's hash on it (`defectSha256`, new optional field on `RcaSchema`); `qa rca approve <defect-id> --approved-by <name>` (MCP `qa.rca_approve`) records a review approval bound to the RCA's exact content. An approved RCA reads back as `draft` once the defect it explains changes. The RCA renders to Markdown with facts kept apart from hypotheses.
- 68f1be0: Add `@qa-ai-stlc/runner-a11y` and route `qa run --test-type a11y` (MCP `qa.run`) through it. An accessibility spec is an ordinary Playwright test that navigates and calls the generated `scanAccessibility(page, testInfo)` helper (`tests/qa/a11y-scan.ts`); the engine hands the helper the axe-core plan derived from the `a11y` configuration, registers each scan as `a11y-scan` evidence with exceptions applied, and sets the case's status from it: violations fail the case, `incomplete` results leave it `uncertain`, and a case that never scanned is rejected with `RUNNER_A11Y_NO_SCAN`. `qa run` and `qa.run` no longer answer `RUN_TEST_TYPE_UNSUPPORTED` for `a11y`.
- 210e92b: Add `@qa-ai-stlc/runner-api` and route `qa run --test-type api` (MCP `qa.run`) through it. Before any spec runs it loads the OpenAPI 3.x contract named by `api.source` and checks every case the spec declares: the case must be an `api` case listing the contract operations it exercises in the new optional `endpoints` field, and every one must exist in the contract, otherwise the run is rejected with `API_CASE_NOT_IN_CONTRACT` before a request is sent. The contract text is stored as `artifacts/api-contract.txt` and registered in the manifest. Contract loading and OpenAPI parsing move from the explorer into `@qa-ai-stlc/core` (`loadApiContract`), and contract URLs and discovery probes are now checked against the environment's scheme and port as well as its hostname.
- bea8a20: Add `safeNonGetRequests` to an environment (ADR-0014): named `POST` requests (exact path, written reason) that safe mode lets through in every safe-mode session, so an application that opens its session with a POST can be explored. `qa explore` and `qa.browser_close` list what was let through and what was blocked, by method and path; an entry only a local config layer adds is reported as a relaxation; `qa config add environment` takes `--allow-request` and `--allow-request-reason`, and no MCP tool can set the list.
- 29c8fdb: Add a `ui.componentLibrary` config setting (`none`, `kendo-jquery` or `kendo-angular`, default `none`). `qa init --component-library` and `qa.init` (`componentLibrary`) record the answer, the `qa-start` skill asks for it, and `qa config set ui.componentLibrary <value>` and `qa.config_set` change it later.

### Patch Changes

- 4bc34b7: The `qa-start` skill now runs first-time setup in conversation through `qa.init`, `qa.config_add` and `qa.doctor`: it states the project root, asks each testing-scope question, and never answers one for the operator. The README quick start leads with that path and no longer claims `qa init` has interactive prompts.
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
- 434e07f: Load the configuration in two layers (ADR-011): `.qa/config.yaml` plus an optional, git-ignored `.qa/config.local.yaml`, or the file named by `QA_CONFIG_LOCAL`. The local layer may set only `environments`, `identities`, `source` and `agents`; objects merge key by key and arrays and scalars replace. Validation errors name the file each bad value came from. Every CLI command except `init` prints a `CONFIG_RELAXATION` warning to stderr for each allowlist entry or `tlsInsecure: true` that the local layer adds. `qa init` adds `/config.local.yaml` to `.qa/.gitignore`, including in existing projects.
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
- fbbbab7: Fixed `config.yaml`'s `selectors.testIdAttribute` being silently ignored: the crawler, pick mode
  and static source analysis all hardcoded `data-testid` regardless of what was configured, so an
  application using a different stable test attribute (e.g. `data-ui-id`) got no test-id locator
  signal at all. The configured attribute is now read consistently by exploration, and by Playwright
  itself (`getByTestId()`) during both live stability scoring and generated test execution.
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

### Patch Changes

- Updated dependencies [97a57f7]
  - @qa-ai-stlc/core@1.4.0
  - @qa-ai-stlc/explorer@1.4.0
  - @qa-ai-stlc/runner-playwright@1.4.0
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

- 592d606: `qa run` / `qa.run` now fails with a coded `RUN_NO_RESULTS` error when a spec set produces zero
  results — a `--spec` path that does not exist or matches no tests previously wrote an empty
  `RunRecord` and exited `0`, a silent false green since nothing was actually verified. Distinct from
  a run that produced results with a `skipped`/`passed` status, which is unaffected.
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

## 0.11.0

### Minor Changes

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

## 0.10.0

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

## 0.9.1

### Patch Changes

- Updated dependencies [3590f7a]
- Updated dependencies [af2f3da]
  - @qa-ai-stlc/schemas@1.0.1
  - @qa-ai-stlc/explorer@1.0.1
  - @qa-ai-stlc/core@1.0.1

## 0.9.0

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

## 0.8.0

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

## 0.7.2

### Patch Changes

- Updated dependencies [0679258]
  - @qa-ai-stlc/schemas@0.9.0
  - @qa-ai-stlc/core@0.10.0
  - @qa-ai-stlc/explorer@0.7.1

## 0.7.1

### Patch Changes

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

- Updated dependencies [65d8538]
  - @qa-ai-stlc/core@0.9.0
  - @qa-ai-stlc/explorer@0.7.0

## 0.7.0

### Minor Changes

- 554ec6d: Add test case traceability (development plan section 2.7 step 9): a case must link to at least one requirement (`TestCaseSchema.requirementIds` now requires a non-empty array), and every link is checked against the scope artifact's actual requirement ids, not just validated for shape.

  `@qa-ai-stlc/core` gained `findUnlinkedRequirementIds`, a pure function cross-checking a case's `requirementIds` against a `Scope`.

  `@qa-ai-stlc/cli` gained `qa cases add --path <path>`: validates a test case written as JSON and registers it under `artifacts/cases/<id>.json`, rejecting it up front if any linked requirement does not exist in `artifacts/scope.json`. `qa validate` now also re-checks every already-registered case's links on every run — a link broken later by editing `scope.json` is caught here, not only at `cases add` time — and its exit code is nonzero for a reopened gate or any unlinked case.

### Patch Changes

- Updated dependencies [554ec6d]
  - @qa-ai-stlc/schemas@0.8.0
  - @qa-ai-stlc/core@0.8.0
  - @qa-ai-stlc/explorer@0.6.5

## 0.6.0

### Minor Changes

- 859a980: Add `qa scope --from file --path <path>` and `qa scope --from text --content <text> --label <label>`: deterministic, rule-based requirement extraction into `artifacts/scope.json` (the framework never fetches requirements from a tracker). A level-2 Markdown heading (`## Title`) becomes one requirement; repeated calls upsert by requirement id instead of duplicating or replacing the whole set, so a later source's content for the same requirement wins while other requirements (and any hand-edited `inScope`) are left untouched. The scope artifact is registered in `manifest.json` on every write, same as the selector registry.

  `@qa-ai-stlc/core` gained the underlying `extractRequirements` and `mergeRequirements` functions.

### Patch Changes

- Updated dependencies [859a980]
  - @qa-ai-stlc/core@0.7.0
  - @qa-ai-stlc/explorer@0.6.4

## 0.5.0

### Minor Changes

- 0b5fbd6: Add the v0 pipeline state machine (ADR-003): `scope` then `cases`, approved in order, each gate bound to the SHA-256 of the exact artifact content it approves.

  `@qa-ai-stlc/schemas` gained `PipelineStateSchema` (artifact kind `state`, `.qa/state.json`), `PhaseNameSchema` and `GateStatusSchema`.

  `@qa-ai-stlc/core` gained `GateStateMachine` (`approve()`/`validate()`), `ApprovalLedgerStore` (`.qa/artifacts/approval-ledger.json`, append-only), `PipelineStateStore` and the exported `PHASES` order. `validate()` always recomputes every gate's status from the ledger and each approved artifact's current content rather than trusting a cached field — editing an approved artifact reopens its gate the next time `approve()` or `validate()` runs, with no separate tamper check needed.

  `@qa-ai-stlc/cli` gained two commands: `qa approve <gate> --artifact <path> --approved-by <name> [--note <text>]` and `qa validate`. `qa validate` exits nonzero only when a gate that had a real approval no longer matches it (a reopened gate), not for a phase simply not yet approved.

### Patch Changes

- Updated dependencies [0b5fbd6]
  - @qa-ai-stlc/schemas@0.7.0
  - @qa-ai-stlc/core@0.6.0
  - @qa-ai-stlc/explorer@0.6.3

## 0.4.1

### Patch Changes

- a6629ed: Fix `qa explore --pick` launching its browser headless, so the window a human is supposed to click
  elements in never actually appeared and the command hung until pick mode's 30-minute timeout.
  `BrowserLauncher.launch()` now takes an optional `{ headless }`; pick mode passes `headless: false`,
  every other caller (crawling, scripted login) is unaffected and still launches headless.
- Updated dependencies [a6629ed]
  - @qa-ai-stlc/core@0.5.1
  - @qa-ai-stlc/explorer@0.6.2

## 0.4.0

### Minor Changes

- baeee88: Add `qa config add environment <name> --base-url <url> --allowlist <a,b,c>` and `qa config add identity <name> --auth <cdp-attach|storage-state> --secret <QA_...> [--login-url <url>] [--username <user>]`. Both validate the new entry against its schema before writing, refuse to overwrite an existing name unless `--force` is passed, and edit `config.yaml` in place (same technique as `qa config set`) so existing comments and formatting survive — no more hand-editing YAML to add an environment or identity.

## 0.3.0

### Minor Changes

- 524a9c8: `qa init` now runs the testing scope survey (development plan section 2.7): Web E2E, API, accessibility and security are answered independently with `--e2e`, `--api`, `--a11y` and `--security` (each `in-scope` or `out-of-scope`), plus optional `--source-path` and, when API is in scope, `--api-source`. `qa init` refuses to finish with a type left `undecided` unless `--defer-scope` is passed, so a project never silently starts with a scope nobody decided.

  Add `qa config set testing.<type> <in-scope|out-of-scope|undecided>` to change one testing type's scope decision later, preserving the rest of `config.yaml` (including comments and formatting).

  `qa doctor` gains two checks: `source-path` (is `source.path` readable) and `api-contract` (is `api.source` reachable — over HTTP for a URL, on disk for a local file; `"discover"`/`"synthesize"` are not checked, since neither is a file or a URL).

  `@qa-ai-stlc/core` exports the two new doctor checks, `checkSourcePathReadable()` and `checkApiContractReadable()`.

### Patch Changes

- bc12efc: Fix a crash in `qa doctor` (and every other command) on Windows: the bin entry point called `process.exit()` immediately after `runCli()` resolved, which could crash the whole process with a libuv assertion ("`UV_HANDLE_CLOSING`") when a real `fetch()` call — `qa doctor`'s environment reachability check — had just run, because undici's keep-alive socket handle had not finished closing when the forced exit tore down the event loop. The bin entry point now sets `process.exitCode` instead, letting Node drain the event loop naturally before exiting.
- Updated dependencies [524a9c8]
  - @qa-ai-stlc/core@0.5.0
  - @qa-ai-stlc/explorer@0.6.1

## 0.2.1

### Patch Changes

- Updated dependencies [143e889]
  - @qa-ai-stlc/explorer@0.6.0
  - @qa-ai-stlc/schemas@0.6.0
  - @qa-ai-stlc/core@0.4.1

## 0.2.0

### Minor Changes

- f301cb4: Add the `qa explore` command to `@qa-ai-stlc/cli`: crawls the configured environment, synthesizes and scores locator candidates, and writes `.qa/selectors/registry.json`, `.qa/selectors/missing-test-ids.json` and the generated `tests/qa/locators.ts`, registering all three in the manifest. `--static` merges in static source analysis findings when `source.path` is configured; `--pick <url>` runs a manual pick-mode session against one page instead of crawling. `--verify` re-checks every stored, non-deprecated element's primary candidate against the live page it was found on and exits non-zero when one no longer resolves as well as it did when last recorded — the signal a stale selector (for example a renamed test ID) needs.

  `@qa-ai-stlc/schemas`'s `SelectorElementSchema` gains an optional `pageUrl`, recorded by a `crawl`/`manual` entry so `qa explore --verify` knows which live page to re-check a stored element's candidates against.

  `@qa-ai-stlc/core`'s `FileSystem` port gains `listFiles()`, listing every regular file under a directory tree recursively; `qa explore --static` uses it to discover source files to scan.

### Patch Changes

- Updated dependencies [f301cb4]
  - @qa-ai-stlc/core@0.4.0
  - @qa-ai-stlc/explorer@0.5.1
  - @qa-ai-stlc/schemas@0.5.0

## 0.1.4

### Patch Changes

- Updated dependencies [3bb0f18]
- Updated dependencies [99ddeb2]
  - @qa-ai-stlc/schemas@0.4.0
  - @qa-ai-stlc/core@0.3.0

## 0.1.3

### Patch Changes

- Updated dependencies [033e9a1]
  - @qa-ai-stlc/schemas@0.3.0
  - @qa-ai-stlc/core@0.2.1

## 0.1.2

### Patch Changes

- Updated dependencies [27866c6]
  - @qa-ai-stlc/core@0.2.0
  - @qa-ai-stlc/schemas@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [823eb39]
  - @qa-ai-stlc/core@0.1.0
  - @qa-ai-stlc/schemas@0.1.0

## 0.1.0

### Minor Changes

- f610fdc: Add the `qa` CLI: `qa init` creates the `.qa/` store, a starting `config.yaml` and a `.gitignore`; `qa doctor` checks Node, browsers, identities and environment reachability, with `--fix` to install missing browsers. Every command supports `--json` output and exits non-zero on failure.
