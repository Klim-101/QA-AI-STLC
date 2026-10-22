# @qa-ai-stlc/mcp-server

## 1.13.0

### Minor Changes

- b1c61d1: An environment can pin the language of its browser contexts with `locale`, a BCP 47 tag such as `en-US`. Exploring, picking, the interactive browser session, signing in, and running or verifying a generated spec all use it, so the text of the application, and with it element names and text locators, no longer depends on the machine running the engine. Set it with `qa config add environment --locale <tag>` or the `locale` input of `qa.config_add`; an invalid tag is rejected. Leaving it out keeps today's behavior: the machine's own language applies, so existing projects are unchanged. The security audit's sign-in still uses the machine's language.
- 5cc4ac7: `qa.browser_open` and `qa.browser_attach` take `caseId` instead of the `executionMode` flag. Real (non-GET) requests are allowed in a session only for a case of an approved case set: the engine refuses with `EXECUTION_CASE_NOT_APPROVED` until the operator approves the `cases` gate, and again once the case is edited. Callers that passed `executionMode: true` must pass the id of the case they execute.
- 626f41c: `qa.http_execute` sends a method other than GET, HEAD, OPTIONS or QUERY only for a case of an approved case set: it takes `caseId` and refuses with `HTTP_EXECUTE_CASE_REQUIRED` without one and `EXECUTION_CASE_NOT_APPROVED` until the operator approves the `cases` gate. Reads need no case. Callers that sent a POST, PUT, PATCH or DELETE must now pass the id of the case they execute.

### Patch Changes

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

- 7a61e80: The engine enforces the `agents` budgets of `.qa/config.yaml` on spoke dispatch. `qa.spoke_record_input` fails with `SPOKE_PARALLELISM_EXCEEDED` while `agents.parallelism` spokes of the run are still running (an attempt past `agents.spokeTimeoutSeconds` no longer holds a slot), and answers `status: retry_budget_exhausted` with a `SPOKE_RETRY_BUDGET_EXCEEDED` `budgetError`, storing nothing, once a task has used its first attempt plus `agents.retries` re-dispatches. `qa.spoke_record_output` fails with `SPOKE_TIMEOUT_EXCEEDED` for a result that arrives after `agents.spokeTimeoutSeconds`. The result of `qa.spoke_record_input` gains `status`, and `inputPath` is absent when nothing was stored. Both tools now need the project configuration.
- dd86e85: The `qa-metrics` skill answers questions about how a run of the agent layer was carried out ("how did the agent run go", "how many retries did we use", "did we stay within the parallelism budget") by relaying `qa.run_metrics`, and says that tokens and cost are not measured instead of estimating them. `qa.run_metrics` now also returns `markdown`, the same figures rendered by the engine (seconds converted and formatted once), which the skill relays as it is; `qa metrics` prints that rendering.
- 0f640f2: The `qa-regression` skill and `qa.regression_plan` (also `qa regression plan --max-tier <tier>`). The engine selects the regression pack for a tier threshold (smoke, critical-path, regression, extended: a pack takes every tier up to the one named) from the registered cases, the run history and the verifications it holds: an approved case is in when its tier is at or below the threshold and its history is not flaky by the configured thresholds, and every case that is out carries its reason (`not-approved`, `no-tier`, `tier-above-threshold`, `flaky`). Each case in is routed to its verified generated spec (grouped for `qa.run`, one call per test type) or to live execution with the reason there is no spec (`no-verified-spec`, `stale-spec`, `spec-changed`). The skill shows the plan, asks before live execution, runs both routes and says what came back.
- e45a829: The reviewer spoke. `qa.review_input` gives it a registered spec, its case, the verification that let it be registered and, for each `expect(...)`, what the engine found: `tautology` (the assertion is about a literal, so it holds whatever the application does), `inline-locator`, `unknown-locator` and `ungrounded-value` (an expected value neither the case nor its proven session contains). The author's reasoning is not part of it. `qa.review_add` (also `qa review add --path`) registers the verdict under `artifacts/reviews/<case-id>.json`, bound to the spec's exact content; the engine refuses an approval with an error finding (`REVIEW_APPROVAL_BLOCKED`), a warning with no reasoned waiver (`REVIEW_WARNING_NOT_WAIVED`) and a waiver for a finding it does not raise. `reviewer` joins the spoke definitions (contract and generated `qa-reviewer` subagent, `agents.models.reviewer`).
- ea67629: `qa.run_metrics` (and `qa metrics [--run <run-id>]`) says how a run of the agent layer was carried out, read from the spoke I/O store and the `agents` budgets only: tasks, attempts and valid, error and unanswered responses per spoke, retries used against `agents.retries`, wall-clock and busy time, the time overlapping attempts saved, attempts that timed out, and the most attempts running at once against `agents.parallelism`. It has no token count or cost: the engine reads no host transcript.
- 31e0dca: `qa.spec_check` (and `qa spec check --spec <path>`) runs a spec set through its runner and says what each test did (status, a capped failure message between untrusted-data markers, missing steps) without recording anything: no run record, result file, evidence or manifest entry, so it changes neither `qa report` nor the history that flaky detection and triage read. The reviewer subagent is now told to check a spec with it instead of `qa.run`, so a review no longer adds a run.
- 00fe126: The triage spoke: `qa.triage_input` gives it every failed result of a run with the failure message, a `failureKind` hint read off it (network, locator-not-found, assertion-mismatch, other), the registered evidence, the case's history across runs and whether the configured flaky thresholds call it flaky. `qa.triage_add` (also `qa triage add --path`) registers its classification under `artifacts/triage/<run-id>.json`: product bug, flaky, stale selector, environment or uncertain, each with a confidence and reasons. The engine refuses a failure left out, one classified twice, evidence that is not the result's, and `flaky` for a case whose history is not flaky. `triage` joins the spoke definitions, so it gets a contract and a generated subagent (`agents.models.triage`).
- 1a5e8e2: A failed run now produces defect drafts through the triage spoke. `qa.defect_draft_input` lists, for each failure the run's registered triage called a product bug, the parts of a draft the engine knows (the case's steps and expected result, its requirements, the failure message as `actualResult`, where the run happened and the evidence the triage cited). A defect draft can name the failure it came from (`source: { runId, resultId }`), and the engine then holds it to the triage: that failure must be a product bug there (`DEFECT_SOURCE_NOT_TRIAGED`), and the draft must cite at least one piece of evidence (`DEFECT_EVIDENCE_MISSING`) and only evidence the triage cited for it (`DEFECT_EVIDENCE_NOT_OF_RESULT`). A flaky, stale-selector, environment or uncertain failure cannot be filed as a defect this way. The triage spoke's contract and subagent now draft the defects after registering the triage; accepting a draft stays the operator's step.

### Patch Changes

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

- ff04ffd: `qa.browser_open` takes `headed` to open the interactive session in a visible window, so an operator can watch a `qa-execute` run or sign in by hand. The environment gets a `headed` setting as the default (a machine setting the local layer may set, shown by `qa config show`); the input overrides it either way. A headed session keeps safe mode, the domain allowlist, evidence registration and secret scanning, and the result's `headed` says which mode was launched. A machine without a display gets `BROWSER_HEADED_UNAVAILABLE` with a remediation instead of a raw Playwright message. The `qa-execute` guidance tells the agent to offer it when the operator wants to watch.
- 2087fda: `qa report --output [path]` and the `output` input of `qa.report` save a Markdown run-result report to the project. It is rendered from the engine's own data: a case table with status, finish time, evidence count and result id, the failure reasons, the `qa run` executions of generated specs, the accessibility conformance counts, the defects with the status their approval supports and the approved root cause analyses. A section with nothing to show is omitted, `blocked`, `skipped`, `uncertain` and `partial` keep their own names, and evidence is counted, never inlined. The default path is `artifacts/reports/run-result-<date>.md`; the result returns the path written. The `qa-report` skill points the operator to the saved file.
- a55b57f: A spoke I/O store: the hub records what it gave each spoke and what came back under `.qa/runs/<run-id>/spokes/<spoke>/<task>/attempt-<n>/` with three new tools. `qa.spoke_record_input` stores the task and minimal context and returns the attempt number the engine assigned (a re-dispatch is the next attempt, nothing is overwritten); `qa.spoke_record_output` stores the result exactly as received, before the hub validates its payload, and refuses an output whose attempt has no recorded input; `qa.spoke_list` lists the attempts of a run with the status of each output. Secrets are redacted before anything is written, names must be single safe path segments, and a record over 256 KiB is refused. The hub definition describes the calls.

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
- d2ede91: `qa.defect_add` and `qa.rca_add` take the defect draft (`draft`) and the root cause analysis (`rca`) inline, validated by their schemas, so an agent writes no scratch file in the operator's project; `path` still works, and exactly one of the two is given. A content that does not match fails with `DEFECT_INVALID` or `RCA_INVALID` whose remediation lists every invalid field by its path with the values it allows, and a file that does not match (`JSON_FILE_INVALID`) now carries the same list instead of a bare message. The fields of both schemas have descriptions in the tool's input schema. The `qa-rca` skill registers inline.
- 5995057: Pick mode can now reach a control behind a collapsed panel. Its click capture swallows every click on an interactive element, so a toggle such as a "Search Details" button was recorded but never opened and the filter inputs inside it could not be picked. The toolbar has a **Browse** switch: while it is on, clicks go to the page and are not captured; switch it off and click the element to capture it. Because browsing lets a click act on the page, the pick-mode session now runs under safe mode's network rules: every non-GET request and every request off the environment allowlist is aborted (a `POST` the environment lists in `safeNonGetRequests` is let through), and the report lists what was blocked. `--pick <url>` refuses a page that is not on the allowlist of the resolved environment (`explorer.pick_mode.url_not_allowed`); with no environment, only the picked page's own host is allowed.

### Patch Changes

- 4810691: An api spec whose `apiAuth` profile reads its token from a browser session (`from-browser`) can now be verified and run. `qa.generation_verify` and `qa run` used to end in `API_AUTH_SESSION_REQUIRED` because nothing gave them a session. They now sign in as the run's identity (the `identity` argument, else the environment's `identity`) in a headless session under safe mode, load the environment's base URL, read the cookie, localStorage or sessionStorage key or request header the profile names, and close the session before the specs start; the token never reaches a spec, a log or a report. A run with no identity still stops with `API_AUTH_SESSION_REQUIRED`, and the remediation now names the identity. The run record names an identity only for runners that sign the specs in, so an api run does not claim a browser sign-in.
- ad08f4a: `qa.browser_expect` with an empty `expected` for `text` or `url` used to pass on every element, because any text contains the empty string; it now means the text is empty and is compared in full, so it fails on an element that has text. `value` with an empty `expected` already checked that an input holds nothing. A generated spec renders an empty `text` expectation as `toHaveText("")` instead of the vacuous `toContainText("")`. The tool description and the `qa-execute` guidance now say that a `count` of 0 only proves that nothing matched, and to pair it with a `visible` check on the container.
- 5aab58c: Three problems at the start of a session. `qa.config_show` failed with a bare schema error for any configuration that lists `safeNonGetRequests`, because the report only accepted a few list shapes; it now reports any list of records, and a value it still cannot report fails with `CONFIG_SHOW_VALUE_UNSUPPORTED`, naming the field and a remediation. `qa.doctor` no longer fails for Firefox or WebKit being absent: the engine launches only Chromium, so only Chromium is checked, and `qa doctor --fix` installs only that. The MCP server answers `--version` without serving, so `npx -y @qa-ai-stlc/mcp-server@<version> --version` warms the cache before the first session; a cold `npx` download can outlast the 30 seconds Claude Code waits for a server to connect (the server needs about five seconds to start once cached), and the install guide and `qa-start` now say so.
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
- 6cbe958: `qa.case_result_register` now accepts `missingStepIds`, so an execution that finished some steps of a case can be registered as `partial` instead of falling back to `uncertain`. The field is required for `partial` and refused for every other status, and each id must be a step of the registered case (`step-<N>` or `expected-result`); otherwise the call fails with `RUN_RESULT_MISSING_STEPS_REQUIRED`, `RUN_RESULT_MISSING_STEP_UNKNOWN` or `RUN_RESULT_MISSING_STEPS_NOT_PARTIAL`. The `qa-execute` guidance says when to use `partial`.
- 2c0a81f: The security audit that `runner-security` can run is now reachable on demand. `qa security authorize --path <file>`, `qa security approve --approved-by <name>` and `qa security audit` (and the MCP tools `qa.security_authorize`, `qa.security_approve`, `qa.security_audit`) register the audit authorization, record the operator's approval of its exact content, and run the authorized checks, filing every finding as a defect draft that is not accepted. All three refuse with `SECURITY_OUT_OF_SCOPE` unless `testing.security` is `in-scope`, and the audit refuses to start without an approved, current authorization. The new `qa-security` skill drafts the authorization, puts it in front of the operator, waits for their approval and reports the result; it fires only on a request for a security audit and is never called by the pipeline. `qa security audit` exits non-zero when it found something or stopped early.
- 48f9f7d: `qa report` and `qa.report` now report the results `qa-execute` registered, not only `qa run` records. A session that executed cases but never ran a spec set no longer ends in `REPORT_NO_RUNS`: the new `interactiveSummary` lists one row per case (its latest result, with an honest status) and the traceability matrix already covered both. `runId`, `runRecordPath` and `runSummary` are now present only when a `qa run` record is reported, and `--run <id>` also accepts the id of a live execution run. `REPORT_NO_RUNS` now means neither kind of result exists.
- 6e64902: Browser specs can now run against a site that needs sign-in. `qa run`, `qa.run` and `qa.generation_verify` sign in as a configured identity and start the browser with its session, so a spec carries no credential and no login steps. The identity is `--identity` / `identity` on the call, else the new `environments.<name>.identity` in `config.yaml`; with neither the run is anonymous. The run record, the run summary and the verification result name the identity used. The session exists only for the run (traces are off for it) and is never written to a report, log or artifact. A login that does not take stops the run with `RUN_SIGN_IN_FAILED` and a remediation, instead of running the specs against the login page; an unknown identity is `RUN_IDENTITY_UNKNOWN`.
- 8a00424: A generated spec now re-checks what its case declares. `qa.generation_spoke_input` renders every `expectations` and `resultExpectations` entry of the case as the assertion line the spec needs (`expectationAssertions`): the matching Playwright assertion on the locator-module function for the browser kinds, the response assertions for an api case, `scanAccessibility` for `a11y-clean`. A selector that names no registry element, or whose element has no function in the module, is listed in `unresolvedExpectations` and is never inlined. `qa.generation_verify` looks for every line, in its step, before running the spec and answers `expectations_missing` with what to add; a spec that asserts them all goes on to the run. A case that declares nothing is unaffected, and its spoke input keeps its hash. `qa-generate-tests` guidance covers both lists.

### Patch Changes

- cd6d619: `qa.browser_expect` with kind `text`, `value` or `url` now accepts an expected value sent as a number or boolean and compares its string form. A client that turned a numeric-looking value such as a gateway id into a number was refused with `BROWSER_EXPECT_INVALID`. A value sent as a string keeps every digit, leading zeros included; `count` still needs a whole number and `checked` only a boolean.
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
- c1f6ed4: `qa.case_result_register` accepts `passed` only when the cited evidence proves it: every step has successful evidence linked to its `stepId`, and the expected result has a successful check of the case's type (e2e: a passing `qa.browser_expect`; api: a response below 400; a11y: a scan with no violations and nothing uncertain). Otherwise it fails with `RUN_RESULT_STEP_NOT_PROVEN` or `RUN_RESULT_EXPECTED_RESULT_UNCHECKED`. A run can hold results for one case only (`RUN_RESULT_RUN_BOUND_TO_OTHER_CASE`). `qa.browser_accessibility_scan` takes a `stepId`.
- e78749c: `qa.cases_add` takes the test case inline as `testCase`, so `qa-design-cases` no longer writes temporary case files into the project tree. `path` still works for an existing file; giving both, or neither, fails with `CASES_ADD_USAGE`.
- c0707e2: API testing can be turned on after `qa init`: `qa config set testing.api in-scope --api-source <file, URL, discover or synthesize>` (and `apiSource` on `qa.config_set`) writes the `api` section with the scope change. Without a source the call fails with `CONFIG_SET_API_SOURCE_REQUIRED` and says how to give one. Switching `testing.api` off again keeps the `api` section.
- 8e41570: The crawl can start from operator-given pages, not only `baseUrl`: `qa explore --url <url-or-path>` (repeatable) and the `startUrls` input of `qa.explore`. Each must be on the environment allowlist.
- 940b19d: New `qa status` command and `qa.status` tool: the pipeline gates plus an ordered list of next actions. Once the last gate (`cases`) is approved it names what follows outside the pipeline: exploring the application, executing approved cases that have no passing result, and generating tests for passing ones, each with the skill and first tool to use. The hub and `qa-start` relay it instead of saying nothing comes next.
- 48e3c2f: The crawl finds single-page-application routes that have no `<a href>`: it reads `routerLink`, `ng-reflect-router-link` and `data-href` attributes and the URLs a page pushes through the History API. With `qa explore --probe-navigation` (`probeNavigation` on `qa.explore`) it also clicks buttons outside forms, each in a throwaway context under safe mode, and keeps the page a click led to (ADR-0015). The route map records how each route was found (`router-attribute`, `history-api`, `click-probe`).

### Patch Changes

- 585653b: `qa.browser_fill` takes `valueFromEnv`, the name of a `QA_*` environment variable the engine reads itself, so a password or other credential can be typed without passing through the agent.
- 6160291: `qa.browser_open` takes an optional `identity` and signs the interactive session in before the first navigation, so `qa-execute` can run a case on an application behind a login page. The result names the identity and never carries its session.
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
