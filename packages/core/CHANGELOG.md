# @qa-ai-stlc/core

## 1.14.2

### Patch Changes

- 6e36036: The declared-expectation check now reads a test inside `test.describe` (including `.serial`, `.parallel`, `.only` and nested describes), as it does a top-level test, so a spec written the way the generation standards describe is no longer rejected. A test in `test.describe.skip` or `.fixme` still counts as one that never runs.
- @qa-ai-stlc/schemas@1.14.2

## 1.14.1

### Patch Changes

- 29bc53b: `qa.case_result_register` no longer fails with `JSON_FILE_INVALID` once a `qa run` has been recorded. The check that a run is not reused for another case now reads only run results, not the `run.json` summaries and spoke records that also live under `.qa/runs/`.
- 483a711: `qa run` (and MCP `qa.run`) can bound parallelism and the per-test timeout with `--workers <n>` and `--timeout-ms <ms>` (`workers`, `testTimeoutMs`). Without them Playwright's defaults still apply, so a large spec set against a slow application no longer has to fail with 30-second timeouts that disappear in smaller batches.
- @qa-ai-stlc/schemas@1.14.1

## 1.14.0

### Minor Changes

- 1d566ab: Let the operator take a requirement out of scope. `qa scope set <in-scope|out-of-scope> <requirement-id>...` and the `qa.scope_set` tool move requirements in or out of `artifacts/scope.json`; the scope gate's hash covers the change, so an approved gate reopens. Out-of-scope requirements are left out of the traceability matrix and its coverage counts. `qa scope` no longer resets a requirement's scope decision when it reads the source again, and it reports requirements whose section left the source but that are still in scope as `orphaned`. The `qa-start`, `qa-design-cases` and scope-phase guidance describe the new step.

### Patch Changes

- 7e5b155: Refuse an `api` case without `endpoints` when it is added (`CASE_API_ENDPOINTS_REQUIRED`), instead of failing later at spec generation and reopening the cases gate. `qa-design-cases` now says to fill `endpoints` from the contract.
- 256380c: Refuse an evidence `stepId` that is not `step-<N>` when a browser or HTTP tool is called, and leave such ids out when a case's proven session is read back, instead of failing the whole session. `qa-execute` now says to link the expected-result checks to the case's last step.
- caf298b: Make `qa explore` and `qa explore --verify` faster: the sign-in, crawl, page analysis and scoring steps of one run now share a single Chromium instead of starting one each, and the stability check counts candidates in small concurrent batches instead of one at a time. Every step still opens browser contexts of its own, so sessions stay isolated. `@qa-ai-stlc/core` exports `createSharedBrowserLauncher`.
- 14cadbb: Say what happened when a browser session's browser goes away. A browser that exits right after `qa.browser_open` launched it now fails with `BROWSER_EXITED_DURING_OPEN` and a remediation, instead of a raw "Target page, context or browser has been closed". A session whose window is closed later (by the operator or a crash) is reported as `BROWSER_SESSION_LOST` on its next call, instead of as an unknown id. `qa-execute` tells the agent to say so and ask before carrying on headless.
- 3026937: Let an api case that expects an error status be registered as `passed` when the `http-status` is declared in `resultExpectations`: a request that returned exactly that status now proves the step that made it. `qa-execute` no longer says such a case cannot be `passed`.
- Updated dependencies [256380c]
  - @qa-ai-stlc/schemas@1.14.0

## 1.13.0

### Minor Changes

- ad5e756: An element id no longer contains the origin of its page: it is made from the environment's name and the page's path. The same environment served on another port, for example through a local configuration file, now gets the same ids, so the registry, the locator module and the generation stamps stop differing between machines. Elements already in the registry are re-keyed, with their names and history, the next time their environment is explored. The locator module and the generation stamps change once, in that run.
- b1c61d1: An environment can pin the language of its browser contexts with `locale`, a BCP 47 tag such as `en-US`. Exploring, picking, the interactive browser session, signing in, and running or verifying a generated spec all use it, so the text of the application, and with it element names and text locators, no longer depends on the machine running the engine. Set it with `qa config add environment --locale <tag>` or the `locale` input of `qa.config_add`; an invalid tag is rejected. Leaving it out keeps today's behavior: the machine's own language applies, so existing projects are unchanged. The security audit's sign-in still uses the machine's language.
- 5cc4ac7: `qa.browser_open` and `qa.browser_attach` take `caseId` instead of the `executionMode` flag. Real (non-GET) requests are allowed in a session only for a case of an approved case set: the engine refuses with `EXECUTION_CASE_NOT_APPROVED` until the operator approves the `cases` gate, and again once the case is edited. Callers that passed `executionMode: true` must pass the id of the case they execute.
- 626f41c: `qa.http_execute` sends a method other than GET, HEAD, OPTIONS or QUERY only for a case of an approved case set: it takes `caseId` and refuses with `HTTP_EXECUTE_CASE_REQUIRED` without one and `EXECUTION_CASE_NOT_APPROVED` until the operator approves the `cases` gate. Reads need no case. Callers that sent a POST, PUT, PATCH or DELETE must now pass the id of the case they execute.

### Patch Changes

- 9f40a76: A scripted sign-in now checks its login page against the environment allowlist on every path. Before, only `qa run` and the security audit did, so exploring or opening a browser session could send an identity's password to a page outside the allowlist.
- Updated dependencies [b1c61d1]
  - @qa-ai-stlc/schemas@1.13.0

## 1.12.1

### Patch Changes

- eecace0: An allowlist entry may now name a port (ADR-0019). `localhost:8091` admits that host on exactly that port; a bare `localhost` still admits it on the port of `baseUrl` only. Before, an application served from one port that read its data from an API on another (an interface on `:4200`, its API on `:8091`) was explored without its data, because every call to the API was blocked and no setting could allow it. List both entries, `[localhost, localhost:8091]`: a port entry does not admit the port of `baseUrl` on its own, and the scheme of `baseUrl` still applies to every entry. One function now decides for the browser, the HTTP tools, the runners and the explorer, and the explorer's crawl filter and the cookie check read the host of an entry. The explore report names the entry that would admit a blocked port (`host:port`). The operator adds a port entry in `config.yaml` or with `qa config add environment`; `qa.config_add` refuses one with `CONFIG_ALLOWLIST_PORT_NOT_SETTABLE`, and an entry that only the local layer adds is reported as a relaxation. An entry with a path or a scheme is still rejected.
- 06816a0: `qa explore` and `qa.browser_close` now say why safe mode blocked a request. The summary used to count every blocked request as `non-GET`, so a plain `GET` to an API on another port (an allowlisted host on a different port) was reported as a mutation and the hint pointed at `safeNonGetRequests`, which cannot help. Each blocked request now carries a reason: `method` (not a `GET`), or `host`, `scheme` or `port` (it left the environment's allowlist or `baseUrl`). `qa explore` prints a line per reason and a separate list with a hint that fits it: only a blocked method points at `safeNonGetRequests`; a blocked origin points at the allowlist and `baseUrl`. `qa.explore` returns `blockedRequestCounts` (complete, unlike the capped listing) and a `reason` on each blocked entry; `qa.browser_close` returns a `reason` on each blocked request and `blockedCounts`. A request off the allowlist is reported by its origin whatever its method. Pick mode now sums the complete counts instead of the capped listing. The `qa-explore` skill reads the reason before advising.
- 54311ad: The API-contract check of `qa doctor` now uses the settings of the environment that serves the contract, not only the defaults. A contract URL whose host, scheme and port an environment admits is fetched with that environment's `tlsInsecure` (only when every environment serving it asks for it, so one cannot weaken the check for another) and with its new `reachabilityTimeoutMs`. Before, the contract check always validated TLS, so a contract over HTTPS with a self-signed certificate failed although its environment passed, and it always gave up after 5 seconds. `reachabilityTimeoutMs` is an optional per-environment setting, from 1000 to 120000 milliseconds, that also applies to the environment's own reachability check; 5000 stays the default. A contract no environment serves is fetched with the defaults.
- 1d82f20: `qa doctor` now says why a reachability check failed instead of only `is not reachable`. The environment and API-contract URL checks name the reason (no response within the limit, connection refused, host name not resolved, certificate not trusted, connection timed out or reset, invalid URL) and give a remediation that fits it, so a flaky result can be told from a down application. The message no longer carries the URL's credentials or query values: a URL such as `https://user:secret@host/spec?token=abc` is shown as `https://host/spec?token=[REDACTED]`, keeping the query keys. A response with any HTTP status still counts as reachable.
- d535bda: Exploring a second environment no longer disturbs the first one's elements (ADR-0020). The project has one selector registry and one API surface however many environments it lists, and a crawl of the second used to report the first environment's elements as `removed` and to mark them deprecated, which also made `--verify` skip them. A registry element and an endpoint now name their environment (an optional field, so existing files stay valid and need no migration). A run replaces, deprecates, renames, verifies and counts only the elements of its own environment, leaves the others as they were, and says how many it left (`otherEnvironmentElementCount`, and a line in the explore summary). An element stored without an environment is read as belonging to the environment whose address rules admit its page, or to every environment when it has no page, and is claimed as it is explored again. No name of an element left alone is given to a new one, so the single locator module keeps unique function names. Generation and generated-spec verification offer only the elements of the spec's environment, `qa api-diff` compares the contract with the endpoints of its environment, and an element registered from a browser session is recorded under the session's environment. A call to `qa.generation_spoke_input` for an `e2e` case now has to name the environment when the project has more than one, as it already did for an `api` case.
- 4dc2110: Safe mode now lets the safe HTTP methods through, not only `GET`: `GET`, `HEAD`, `OPTIONS` and `QUERY` (ADR-0018). An application that reads with `QUERY` (a read whose parameters travel in a request body, as a product search or a category tree often does) used to load nothing during exploration, because safe mode aborted every `QUERY` request as a mutation and `safeNonGetRequests` accepts `POST` only. The comparison is exact and case-sensitive, `TRACE` stays blocked, and every other method (`POST`, `PUT`, `PATCH`, `DELETE`) is aborted as before. The domain allowlist still applies to every request. The browser safe-mode handler and the security probe now share one definition of a safe method (`SAFE_HTTP_METHODS` in `@qa-ai-stlc/core`), so the two can no longer disagree; the security probe now also sends a `QUERY` request without an authorization entry. A `QUERY` request that goes through is not yet recorded as an endpoint in `endpoints.json` or compared with the OpenAPI contract, which do not know the method.
- Updated dependencies [eecace0]
- Updated dependencies [54311ad]
- Updated dependencies [d535bda]
  - @qa-ai-stlc/schemas@1.12.1

## 1.12.0

### Minor Changes

- 0d13f55: The agent-layer eval set. `EvalScenarioSchema` names the catalogued demo-app bugs a run is expected to find; `runEvalScore` scores a project against it from what the engine recorded: bugs detected, valid spoke responses (from the spoke I/O store), selector stability and spoke duration, with rates left `null` when there is nothing to divide by and tokens and cost listed as not measured. `npm run eval` runs a scripted baseline against the demo app, or with `--project <dir>` scores a project a real agent worked in, and writes the report as JSON and Markdown.
- 7a61e80: The engine enforces the `agents` budgets of `.qa/config.yaml` on spoke dispatch. `qa.spoke_record_input` fails with `SPOKE_PARALLELISM_EXCEEDED` while `agents.parallelism` spokes of the run are still running (an attempt past `agents.spokeTimeoutSeconds` no longer holds a slot), and answers `status: retry_budget_exhausted` with a `SPOKE_RETRY_BUDGET_EXCEEDED` `budgetError`, storing nothing, once a task has used its first attempt plus `agents.retries` re-dispatches. `qa.spoke_record_output` fails with `SPOKE_TIMEOUT_EXCEEDED` for a result that arrives after `agents.spokeTimeoutSeconds`. The result of `qa.spoke_record_input` gains `status`, and `inputPath` is absent when nothing was stored. Both tools now need the project configuration.
- 7fb6c83: Spokes dispatched in parallel on Claude Code no longer lose each other's writes. The store has `withLock`, a lock under `.qa/locks/` that waits for the holder and takes over one left by a process that died (`STORE_LOCK_TIMEOUT` after 30 seconds). The manifest, the case indexes, the selector registry and a run's spoke records are written under it, so parallel registrations, case designs, explorations and dispatches (`SPOKE_PARALLELISM_EXCEEDED` is now exact under concurrency) all survive. Files are saved whole through a temporary file and a rename, so a reader never sees half of one. `persistExploreResult` reads the registry it merges into inside the lock, and no longer takes it as an argument. The hub definition says when it may dispatch spokes in parallel.
- 62bc410: Three skills join the agent layer: `qa-api` (compare the OpenAPI contract with the application, set up API authentication, run the API specs), `qa-accessibility` (run the accessibility specs or scan named pages and explain the findings) and `qa-triage` (sort the failures of a run and draft the product bugs through the triage spoke). A single approved case run live is still `qa-execute`.
- dd86e85: The `qa-metrics` skill answers questions about how a run of the agent layer was carried out ("how did the agent run go", "how many retries did we use", "did we stay within the parallelism budget") by relaying `qa.run_metrics`, and says that tokens and cost are not measured instead of estimating them. `qa.run_metrics` now also returns `markdown`, the same figures rendered by the engine (seconds converted and formatted once), which the skill relays as it is; `qa metrics` prints that rendering.
- 0f640f2: The `qa-regression` skill and `qa.regression_plan` (also `qa regression plan --max-tier <tier>`). The engine selects the regression pack for a tier threshold (smoke, critical-path, regression, extended: a pack takes every tier up to the one named) from the registered cases, the run history and the verifications it holds: an approved case is in when its tier is at or below the threshold and its history is not flaky by the configured thresholds, and every case that is out carries its reason (`not-approved`, `no-tier`, `tier-above-threshold`, `flaky`). Each case in is routed to its verified generated spec (grouped for `qa.run`, one call per test type) or to live execution with the reason there is no spec (`no-verified-spec`, `stale-spec`, `spec-changed`). The skill shows the plan, asks before live execution, runs both routes and says what came back.
- e45a829: The reviewer spoke. `qa.review_input` gives it a registered spec, its case, the verification that let it be registered and, for each `expect(...)`, what the engine found: `tautology` (the assertion is about a literal, so it holds whatever the application does), `inline-locator`, `unknown-locator` and `ungrounded-value` (an expected value neither the case nor its proven session contains). The author's reasoning is not part of it. `qa.review_add` (also `qa review add --path`) registers the verdict under `artifacts/reviews/<case-id>.json`, bound to the spec's exact content; the engine refuses an approval with an error finding (`REVIEW_APPROVAL_BLOCKED`), a warning with no reasoned waiver (`REVIEW_WARNING_NOT_WAIVED`) and a waiver for a finding it does not raise. `reviewer` joins the spoke definitions (contract and generated `qa-reviewer` subagent, `agents.models.reviewer`).
- ea67629: `qa.run_metrics` (and `qa metrics [--run <run-id>]`) says how a run of the agent layer was carried out, read from the spoke I/O store and the `agents` budgets only: tasks, attempts and valid, error and unanswered responses per spoke, retries used against `agents.retries`, wall-clock and busy time, the time overlapping attempts saved, attempts that timed out, and the most attempts running at once against `agents.parallelism`. It has no token count or cost: the engine reads no host transcript.
- 31e0dca: `qa.spec_check` (and `qa spec check --spec <path>`) runs a spec set through its runner and says what each test did (status, a capped failure message between untrusted-data markers, missing steps) without recording anything: no run record, result file, evidence or manifest entry, so it changes neither `qa report` nor the history that flaky detection and triage read. The reviewer subagent is now told to check a spec with it instead of `qa.run`, so a review no longer adds a run.
- 4b76336: `agents.models` in `.qa/config.yaml` routes each spoke (`explorer`, `test-design`, `case-execution`, `test-generation`, `qa-rca`) to a model, and `qa agents generate` writes one Claude Code subagent per spoke into `.claude/agents/`, each with that `model:` (`inherit` when none is set). It rewrites only files it generated and refuses a file of the same name it did not (`AGENTS_FILE_NOT_GENERATED`). The explorer, test-design, case-execution and test-generation spokes get contract files in `agents/hub/spokes/`, next to `qa-rca`. Hosts whose subagents take no model ignore the setting.
- 00fe126: The triage spoke: `qa.triage_input` gives it every failed result of a run with the failure message, a `failureKind` hint read off it (network, locator-not-found, assertion-mismatch, other), the registered evidence, the case's history across runs and whether the configured flaky thresholds call it flaky. `qa.triage_add` (also `qa triage add --path`) registers its classification under `artifacts/triage/<run-id>.json`: product bug, flaky, stale selector, environment or uncertain, each with a confidence and reasons. The engine refuses a failure left out, one classified twice, evidence that is not the result's, and `flaky` for a case whose history is not flaky. `triage` joins the spoke definitions, so it gets a contract and a generated subagent (`agents.models.triage`).
- 1a5e8e2: A failed run now produces defect drafts through the triage spoke. `qa.defect_draft_input` lists, for each failure the run's registered triage called a product bug, the parts of a draft the engine knows (the case's steps and expected result, its requirements, the failure message as `actualResult`, where the run happened and the evidence the triage cited). A defect draft can name the failure it came from (`source: { runId, resultId }`), and the engine then holds it to the triage: that failure must be a product bug there (`DEFECT_SOURCE_NOT_TRIAGED`), and the draft must cite at least one piece of evidence (`DEFECT_EVIDENCE_MISSING`) and only evidence the triage cited for it (`DEFECT_EVIDENCE_NOT_OF_RESULT`). A flaky, stale-selector, environment or uncertain failure cannot be filed as a defect this way. The triage spoke's contract and subagent now draft the defects after registering the triage; accepting a draft stays the operator's step.

### Patch Changes

- d93192f: A store lock is no longer taken over while its holder is still writing it. A claim creates the lock file and then writes the time into it; a waiter that read it in between saw it empty, took that for an ancient lock and deleted it, so two parallel spokes could hold the lock together and lose each other's writes.
- d75a9a5: The generated `qa-reviewer` subagent has no file, shell or web tool (`disallowedTools: Read, Grep, Glob, Bash, Write, Edit, NotebookEdit, WebFetch, WebSearch`), so it cannot open the generating spoke's records in the project; the engine's own tools are what it keeps. Before, the independence of the review rested on the prompt alone.
- 3d51e7e: Listing run results no longer picks up the spoke records a run holds under `runs/<run-id>/spokes/`. Since the spoke I/O store, `qa report`, `qa validate --run`, `qa.rca_input`, `qa.triage_input` and `qa.triage_add` failed on any project in which the hub had recorded a dispatch, because the records were read as results.
- 40cbef8: `qa validate` no longer reports a registered generated spec as tampered. A manifest entry can name the tree its path is relative to (`root`, `project` for a generated spec and the locator module, absent for `.qa/`), and the sweep looks for the file there. An entry registered before `root` existed is looked for under `.qa/` first, then in the project, so manifests already on disk keep working; an edited or deleted spec is still reported.
- Updated dependencies [0d13f55]
- Updated dependencies [0f640f2]
- Updated dependencies [e45a829]
- Updated dependencies [ea67629]
- Updated dependencies [31e0dca]
- Updated dependencies [7a61e80]
- Updated dependencies [4b76336]
- Updated dependencies [00fe126]
- Updated dependencies [1a5e8e2]
- Updated dependencies [40cbef8]
  - @qa-ai-stlc/schemas@1.12.0

## 1.11.0

### Minor Changes

- ff04ffd: `qa.browser_open` takes `headed` to open the interactive session in a visible window, so an operator can watch a `qa-execute` run or sign in by hand. The environment gets a `headed` setting as the default (a machine setting the local layer may set, shown by `qa config show`); the input overrides it either way. A headed session keeps safe mode, the domain allowlist, evidence registration and secret scanning, and the result's `headed` says which mode was launched. A machine without a display gets `BROWSER_HEADED_UNAVAILABLE` with a remediation instead of a raw Playwright message. The `qa-execute` guidance tells the agent to offer it when the operator wants to watch.
- 2087fda: `qa report --output [path]` and the `output` input of `qa.report` save a Markdown run-result report to the project. It is rendered from the engine's own data: a case table with status, finish time, evidence count and result id, the failure reasons, the `qa run` executions of generated specs, the accessibility conformance counts, the defects with the status their approval supports and the approved root cause analyses. A section with nothing to show is omitted, `blocked`, `skipped`, `uncertain` and `partial` keep their own names, and evidence is counted, never inlined. The default path is `artifacts/reports/run-result-<date>.md`; the result returns the path written. The `qa-report` skill points the operator to the saved file.
- a55b57f: A spoke I/O store: the hub records what it gave each spoke and what came back under `.qa/runs/<run-id>/spokes/<spoke>/<task>/attempt-<n>/` with three new tools. `qa.spoke_record_input` stores the task and minimal context and returns the attempt number the engine assigned (a re-dispatch is the next attempt, nothing is overwritten); `qa.spoke_record_output` stores the result exactly as received, before the hub validates its payload, and refuses an output whose attempt has no recorded input; `qa.spoke_list` lists the attempts of a run with the status of each output. Secrets are redacted before anything is written, names must be single safe path segments, and a record over 256 KiB is refused. The hub definition describes the calls.

### Patch Changes

- c874bfb: Generation verification now requires a declared expectation's assertion to be a statement that always runs. An assertion inside a condition on a value, a loop, a `try`, an uncalled function, a skipped or un-awaited `test.step`, after a `return` or `throw`, or with a `.catch(...)` chained onto it is answered with `expectations_missing` and a message that says the line is written but may never run. A literal `if (true)` or a plain block still counts.
- Updated dependencies [ff04ffd]
- Updated dependencies [a55b57f]
  - @qa-ai-stlc/schemas@1.11.0

## 1.10.0

### Minor Changes

- d2ede91: `qa.defect_add` and `qa.rca_add` take the defect draft (`draft`) and the root cause analysis (`rca`) inline, validated by their schemas, so an agent writes no scratch file in the operator's project; `path` still works, and exactly one of the two is given. A content that does not match fails with `DEFECT_INVALID` or `RCA_INVALID` whose remediation lists every invalid field by its path with the values it allows, and a file that does not match (`JSON_FILE_INVALID`) now carries the same list instead of a bare message. The fields of both schemas have descriptions in the tool's input schema. The `qa-rca` skill registers inline.

### Patch Changes

- 4810691: An api spec whose `apiAuth` profile reads its token from a browser session (`from-browser`) can now be verified and run. `qa.generation_verify` and `qa run` used to end in `API_AUTH_SESSION_REQUIRED` because nothing gave them a session. They now sign in as the run's identity (the `identity` argument, else the environment's `identity`) in a headless session under safe mode, load the environment's base URL, read the cookie, localStorage or sessionStorage key or request header the profile names, and close the session before the specs start; the token never reaches a spec, a log or a report. A run with no identity still stops with `API_AUTH_SESSION_REQUIRED`, and the remediation now names the identity. The run record names an identity only for runners that sign the specs in, so an api run does not claim a browser sign-in.
- ad08f4a: `qa.browser_expect` with an empty `expected` for `text` or `url` used to pass on every element, because any text contains the empty string; it now means the text is empty and is compared in full, so it fails on an element that has text. `value` with an empty `expected` already checked that an input holds nothing. A generated spec renders an empty `text` expectation as `toHaveText("")` instead of the vacuous `toContainText("")`. The tool description and the `qa-execute` guidance now say that a `count` of 0 only proves that nothing matched, and to pair it with a `visible` check on the container.
- 5aab58c: Three problems at the start of a session. `qa.config_show` failed with a bare schema error for any configuration that lists `safeNonGetRequests`, because the report only accepted a few list shapes; it now reports any list of records, and a value it still cannot report fails with `CONFIG_SHOW_VALUE_UNSUPPORTED`, naming the field and a remediation. `qa.doctor` no longer fails for Firefox or WebKit being absent: the engine launches only Chromium, so only Chromium is checked, and `qa doctor --fix` installs only that. The MCP server answers `--version` without serving, so `npx -y @qa-ai-stlc/mcp-server@<version> --version` warms the cache before the first session; a cold `npx` download can outlast the 30 seconds Claude Code waits for a server to connect (the server needs about five seconds to start once cached), and the install guide and `qa-start` now say so.
- Updated dependencies [c0e163c]
- Updated dependencies [d2ede91]
  - @qa-ai-stlc/schemas@1.10.0

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
- 26818b4: `qa.browser_grid_find_row` and `qa.browser_grid_read_cell` wait for a grid that loads its rows after the page is shown. They used to read the grid at once, saw a scroll container with nothing to scroll, took it for a grid that renders every row and reported the row missing after one position (`BROWSER_GRID_ROW_NOT_FOUND ... after visiting 1 page(s)`). The first look now waits, for as long as an action may take, until at least one row is rendered; after a page change or a scroll it still waits only for the rows to change.
- d75348b: `qa.generation_spoke_input` lists the locator functions the module really exports. Since elements with an identical locator share one function, the list built from registry names named functions that do not exist, and a spec importing one failed typecheck. The generated `tests/qa/locators.ts` now says above each function which elements it answers (`// elements: <id> <id>`), and the spoke input reads that. A module written by an older generator is refused with `GENERATION_LOCATOR_MODULE_OUTDATED`; re-run `qa explore` to regenerate it.
- edbb652: The Playwright runner now runs a spec set with the `@playwright/test` the specs themselves resolve, and falls back to its bundled copy only when none is reachable. When the engine ran from an `npx` cache and the project had its own Playwright, the spec registered its tests with a copy nobody was running, Playwright found zero tests, and `qa.generation_verify` ended in `core.verification.unexpected_outcome_count` (and `qa run` in `RUN_NO_RESULTS`). A spec that fails to load now ends in `RUNNER_NO_TESTS_RAN` with Playwright's own message, and the verification error names the spec, the project root and the environment.
- Updated dependencies [6e64902]
- Updated dependencies [8a00424]
  - @qa-ai-stlc/schemas@1.9.0

## 1.8.0

### Minor Changes

- b1d0516: Every registered test case now has a readable Markdown copy with its preconditions, steps and expected result at `artifacts/cases-md/<feature>/<id>.md`, written when the case is added or linked and registered in the manifest. `qa cases add` and `qa.cases_add` return its path as `markdownPath`, and the feature index Markdown links to each copy, so cases can be reviewed before approving the `cases` gate without reading JSON.
- c1f6ed4: `qa.case_result_register` accepts `passed` only when the cited evidence proves it: every step has successful evidence linked to its `stepId`, and the expected result has a successful check of the case's type (e2e: a passing `qa.browser_expect`; api: a response below 400; a11y: a scan with no violations and nothing uncertain). Otherwise it fails with `RUN_RESULT_STEP_NOT_PROVEN` or `RUN_RESULT_EXPECTED_RESULT_UNCHECKED`. A run can hold results for one case only (`RUN_RESULT_RUN_BOUND_TO_OTHER_CASE`). `qa.browser_accessibility_scan` takes a `stepId`.
- e78749c: `qa.cases_add` takes the test case inline as `testCase`, so `qa-design-cases` no longer writes temporary case files into the project tree. `path` still works for an existing file; giving both, or neither, fails with `CASES_ADD_USAGE`.
- c0707e2: API testing can be turned on after `qa init`: `qa config set testing.api in-scope --api-source <file, URL, discover or synthesize>` (and `apiSource` on `qa.config_set`) writes the `api` section with the scope change. Without a source the call fails with `CONFIG_SET_API_SOURCE_REQUIRED` and says how to give one. Switching `testing.api` off again keeps the `api` section.
- 940b19d: New `qa status` command and `qa.status` tool: the pipeline gates plus an ordered list of next actions. Once the last gate (`cases`) is approved it names what follows outside the pipeline: exploring the application, executing approved cases that have no passing result, and generating tests for passing ones, each with the skill and first tool to use. The hub and `qa-start` relay it instead of saying nothing comes next.
- 48e3c2f: The crawl finds single-page-application routes that have no `<a href>`: it reads `routerLink`, `ng-reflect-router-link` and `data-href` attributes and the URLs a page pushes through the History API. With `qa explore --probe-navigation` (`probeNavigation` on `qa.explore`) it also clicks buttons outside forms, each in a throwaway context under safe mode, and keeps the page a click led to (ADR-0015). The route map records how each route was found (`router-attribute`, `history-api`, `click-probe`).
- dafa6ab: A test case can declare structured expectations: `expectations` on a step and `resultExpectations` for the final result (visible, hidden, text, value, count, checked, url, http-status, http-body-contains, a11y-clean). The engine derives from the cited evidence whether each is met, and `qa.case_result_register` refuses `passed` with `RUN_RESULT_EXPECTATION_UNMET` while any is unmet or never checked (ADR-0016). An api case that expects an error status can now be `passed`. Existing cases are unchanged. The readable Markdown copy of a case lists the declared checks.

### Patch Changes

- 585653b: `qa.browser_fill` takes `valueFromEnv`, the name of a `QA_*` environment variable the engine reads itself, so a password or other credential can be typed without passing through the agent.
- 6160291: `qa.browser_open` takes an optional `identity` and signs the interactive session in before the first navigation, so `qa-execute` can run a case on an application behind a login page. The result names the identity and never carries its session.
- Updated dependencies [c1f6ed4]
- Updated dependencies [48e3c2f]
- Updated dependencies [dafa6ab]
  - @qa-ai-stlc/schemas@1.8.0

## 1.7.0

### Minor Changes

- 62612a1: Add the code-assisted security level, used when `source.path` is set. Three new check classes, `dependencies` (`npm audit` over the lockfile), `secrets` (credentials committed with the code; the value is never reported) and `configuration` (debug and test-only routes, debug mode, cookies without HttpOnly or Secure, disabled certificate verification, a wildcard CORS origin), read the checkout through a read-only view and run only when the authorization names them. Findings now carry `codeReferences` (project-relative file and line), and a security defect draft lists them under "Code references". Without `source.path`, or when it points at nothing, the code-assisted classes are `skipped` and the audit logs a notice that it ran black-box only.
- 2663897: Foundation of the on-demand black-box security audit (no command or MCP tool yet). A security audit authorization (`SecurityAuthorizationSchema`: environment snapshot, check classes, identities, prohibited actions, the exact mutations allowed, rate limit and request budget) is registered and approved through a hash-bound `security-authorization` gate; an audit refuses to start (`SECURITY_NOT_AUTHORIZED`, `SECURITY_AUTHORIZATION_STALE`, `SECURITY_OUT_OF_SCOPE`) unless it is approved, unedited, security testing is in scope and the environment's address and allowlist still match. The new `@qa-ai-stlc/runner-security` package sends every request through one probe that enforces the authorized origin and allowlist, only the authorized non-read requests, the rate limit and the request budget, follows no redirects and logs every request sent or refused. Checks end `passed`, `failed`, `skipped`, `blocked` or `uncertain`; an audit with a blocked check or an exhausted budget is `partial`. Findings are registered as evidence and drafted as `category: security` defect drafts. `HttpClient.request()` now also returns each `Set-Cookie` header separately (`setCookies`).

### Patch Changes

- f6dd64c: An accessibility scan result must now be a complete axe-core result: `{}`, `null`, an array, a result without its four result lists, its `testEngine` or the options it ran with is rejected with `A11Y_SCAN_RESULT_INVALID` instead of counting as a clean scan, and a result scanned under other rule tags than the configured WCAG target is rejected with `A11Y_SCAN_CONFIG_MISMATCH`. This covers both the `a11y` runner and `qa.browser_a11y_scan`.
- 05ec635: Refuse to register a case result as `passed` while its run still holds a failed browser expectation (`RUN_RESULT_FAILED_EXPECTATION`). Every expectation under the run is considered, not only the cited evidence, and a failed expectation followed by a later passing one of the same step, target and kind counts as a retry.
- 597ec65: `qa.browser_tabs` no longer misses a page a link opened on a slow machine. It used to sleep a fixed 250 ms, shorter than the time Chromium takes to announce a new page here (about 650 ms); it now waits for the browser's announcement, up to a 2 s deadline counted from the previous tool call, and returns at once when the page was already announced.
- 3ef1938: Generated-spec verification no longer accepts empty named steps. When a run has a canonical step set (verification), a Playwright reporter records, from the step categories Playwright itself reports, how many actions and assertions each `[id]` step contains. A step with neither is reported like a step that did not run (`partial`, with the idle steps named), and the expected result needs a real check: a web-first assertion for a browser test, any assertion for an API test. A spec of empty `test.step()` calls, or one whose only check is `expect(true).toBe(true)`, is no longer `verified`.
- Updated dependencies [62612a1]
- Updated dependencies [2663897]
- Updated dependencies [3691ab0]
  - @qa-ai-stlc/schemas@1.7.0

## 1.6.0

### Minor Changes

- 32bdb52: Add an `a11y` config block: WCAG version (`2.0`, `2.1` or `2.2`, default `2.1`), cumulative conformance level (`A`, `AA` or `AAA`, default `AA`), best-practice rules (default off), include and exclude selectors, and known-issue exceptions with a rule id, a reason and an optional expiry. `qa init` (`--a11y-wcag-version`, `--a11y-level`, `--a11y-best-practices`) and `qa.init` (`a11y`) record the target when accessibility testing is in scope, and the `qa-start` skill asks for it.
- dfafb00: Add a per-criterion accessibility conformance section to `qa report` and `qa.report`, built from the recorded axe-core scans, and record the passed and inapplicable rules in the scan evidence.
- a6bc034: `runHttpExecute` authenticates through a named `apiAuth` profile (`auth`, or the environment's default): basic, bearer, api-key in a header or query parameter, custom headers and OAuth2 client credentials with an in-memory token cache. Credentials are read from `QA_*` variables, attached only after the request URL passes the allowlist (the token URL is checked too), never sent across a redirect, and scrubbed by value and by configured name from the stored request record. Response `Set-Cookie` and `Authorization` headers are now redacted in http-request evidence.
- 9fd9564: Authenticate API specs through `apiAuth` profiles. The engine generates `tests/qa/api-auth.ts` (when an `api` spoke input is built, before a generated spec is typechecked, and before an API run); a spec calls `request.get(url, apiAuth('<profile>'))` and the profile name is a literal union, so an unknown profile fails typechecking. `runner-api` resolves the profiles a spec names, hands them to the Playwright process through its environment only, refuses to do so for a base URL outside the environment's allowlist, and scrubs the credential values from the failures it reports. A spec that carries a credential of its own (an `Authorization` or `Cookie` header, a header or query parameter a profile uses, or a `Bearer`/`Basic` value) is rejected with `HTTP_CREDENTIAL_INPUT_REJECTED` before it runs. A run that carries a credential records no Playwright trace, because a trace archive holds request headers and cannot be scrubbed. `ProcessRunOptions` gains `env` and `runPlaywrightSpecs` takes `env` and `isTraceEnabled`.
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
- f17c924: Render a defect draft as tracker-neutral Markdown through the shared renderer registry (`renderMarkdownArtifact('defect-draft', draft)`): metadata, numbered steps, expected and actual result, requirement links, relative evidence paths and, for security drafts, the assessment fields.
- b5ee556: The browser action tools (`qa.browser_click`, `qa.browser_fill`, `qa.browser_select_option`, `qa.browser_set_date`, the popup tools and the grid tools) accept `ref` from the session's latest `qa.browser_snapshot` in place of `selector`; exactly one of the two is required (`BROWSER_TARGET_INVALID` otherwise). The engine resolves a ref to a role and exact-name selector, records that selector and the ref's role and name in the action evidence, and acts on the selector. A ref from an earlier snapshot, a ref used after a navigation or once the page URL changed, and a ref whose role and name no longer match exactly one element all fail with `BROWSER_REF_STALE`. Refs are numbered across the whole session, so one from an older snapshot is never mistaken for a new element. Action evidence gains an optional `ref` field.
- c7d5747: Data grids can be searched by content. `qa.browser_grid_find_row` finds the row with a given value under a column header and reads its cells; `qa.browser_grid_read_cell` returns one cell of that row. A grid with a pager is searched page by page (rewinding to its first page first), and a virtualized grid by scrolling it from the top, bounded by `maxSteps`. A value held by more than one rendered row is refused as `BROWSER_GRID_ROW_AMBIGUOUS` rather than guessed, a missing row is `BROWSER_GRID_ROW_NOT_FOUND`, and a missing header is `BROWSER_GRID_COLUMN_NOT_FOUND`. The Kendo UI for jQuery and Angular profiles declare their pager buttons and scroll container, and the evidence action types gain `grid-find-row` and `grid-read-cell`.
- 552493f: `qa.http_execute` takes `auth`, the name of an `apiAuth` profile, and the engine adds the credential itself. A raw `Authorization` or `Cookie` header, a header or query parameter that any profile declares, is now rejected with `HTTP_CREDENTIAL_INPUT_REJECTED` and a remediation pointing at profiles. OAuth tokens are cached for the life of the MCP server process.
- c4db737: `qa.browser_accessibility_scan` now runs axe-core against the configured `a11y` target: the WCAG version and cumulative level pick the rule tags (AAA rules are enabled explicitly, as axe-core disables them by default), best-practice rules are opt-in, and include/exclude selectors narrow the scan. `incomplete` results are reported as `uncertain`, violations covered by an unexpired exception are reported as `excepted` instead of dropped, and the evidence records the axe-core version and a hash of the effective `a11y` config.
- 088549c: MCP tools `qa.init`, `qa.config_set` and `qa.config_add` let the operator run the testing-scope survey and edit `.qa/config.yaml` inside the agent host. `qa.init` takes an explicit answer for every testing type (or an explicit `undecided`), returns the absolute project root for the operator to confirm before writing anything, and refuses when `.qa/` already exists in the directory or a parent. The MCP server now resolves the project root the way `qa-start` does: the nearest directory upward that holds `.qa/`. The `init`, `config set` and `config add` operations moved from the CLI into `@qa-ai-stlc/core`; the CLI commands behave as before.
- 4e43236: `qa.browser_select_option` also picks an option of a native by its visible text and checks the select shows it afterwards; a multi-select keeps what it already had chosen. An option the select does not have is `BROWSER_WIDGET_OPTION_NOT_FOUND`, and the error names the options it does have.
- 68de716: An `oauth2-client-credentials` profile that gets a 401 with a cached token now drops the token, fetches a new one and retries the call once; a token that was just fetched is never retried. Every credential used by either attempt is scrubbed from the stored request record.
- ed23378: Add the `qa-rca` skill and its spoke contract. `qa.rca_input` (new) builds the input a root cause analysis is written from — the accepted defect, the cases covering its requirements, their run history, the defect's evidence (hash, size and a bounded excerpt of text evidence between untrusted-data markers) and the configured source location — from registered artifacts only, refusing evidence changed since registration. `RcaSchema` gains `evidencePaths` for the evidence the facts rest on, and `qa.rca_add` rejects any path the engine did not register (`RCA_EVIDENCE_UNREGISTERED`). The RCA Markdown lists its evidence.
- 87e1cca: Add the root cause analysis artifact and its review gate. `qa rca add --path <path>` (MCP `qa.rca_add`) registers an RCA under `artifacts/rca/<defect-id>.json` only for an accepted defect (`RCA_DEFECT_NOT_ACCEPTED` otherwise) and stamps the defect's hash on it (`defectSha256`, new optional field on `RcaSchema`); `qa rca approve <defect-id> --approved-by <name>` (MCP `qa.rca_approve`) records a review approval bound to the RCA's exact content. An approved RCA reads back as `draft` once the defect it explains changes. The RCA renders to Markdown with facts kept apart from hypotheses.
- 68f1be0: Add `@qa-ai-stlc/runner-a11y` and route `qa run --test-type a11y` (MCP `qa.run`) through it. An accessibility spec is an ordinary Playwright test that navigates and calls the generated `scanAccessibility(page, testInfo)` helper (`tests/qa/a11y-scan.ts`); the engine hands the helper the axe-core plan derived from the `a11y` configuration, registers each scan as `a11y-scan` evidence with exceptions applied, and sets the case's status from it: violations fail the case, `incomplete` results leave it `uncertain`, and a case that never scanned is rejected with `RUNNER_A11Y_NO_SCAN`. `qa run` and `qa.run` no longer answer `RUN_TEST_TYPE_UNSUPPORTED` for `a11y`.
- 210e92b: Add `@qa-ai-stlc/runner-api` and route `qa run --test-type api` (MCP `qa.run`) through it. Before any spec runs it loads the OpenAPI 3.x contract named by `api.source` and checks every case the spec declares: the case must be an `api` case listing the contract operations it exercises in the new optional `endpoints` field, and every one must exist in the contract, otherwise the run is rejected with `API_CASE_NOT_IN_CONTRACT` before a request is sent. The contract text is stored as `artifacts/api-contract.txt` and registered in the manifest. Contract loading and OpenAPI parsing move from the explorer into `@qa-ai-stlc/core` (`loadApiContract`), and contract URLs and discovery probes are now checked against the environment's scheme and port as well as its hostname.
- bea8a20: Add `safeNonGetRequests` to an environment (ADR-0014): named `POST` requests (exact path, written reason) that safe mode lets through in every safe-mode session, so an application that opens its session with a POST can be explored. `qa explore` and `qa.browser_close` list what was let through and what was blocked, by method and path; an entry only a local config layer adds is reported as a relaxation; `qa config add environment` takes `--allow-request` and `--allow-request-reason`, and no MCP tool can set the list.
- f1dc0fb: A `from-browser` auth profile reads its token where an operator would find it in developer tools: a cookie, a `localStorage` or `sessionStorage` key (with an optional JSON path) or the observed `Authorization`-style request header, from an open `qa.browser_open` session (`sessionId`) or, for cookies and `localStorage` only, from an identity's saved storage state (`identity`). Only allowlisted origins are read, a session of another environment is refused, the token is read on every call and never returned to the agent or stored in evidence.
- 29c8fdb: Add a `ui.componentLibrary` config setting (`none`, `kendo-jquery` or `kendo-angular`, default `none`). `qa init --component-library` and `qa.init` (`componentLibrary`) record the answer, the `qa-start` skill asks for it, and `qa config set ui.componentLibrary <value>` and `qa.config_set` change it later.
- 16cf78b: Add a catalogue of WCAG 2.0, 2.1 and 2.2 success criteria, classified by how far axe-core covers each one, and a manual checklist of the in-scope criteria that automated scanning cannot decide.

### Patch Changes

- dc289ad: Fix `qa.browser_set_date` and the generated date helper on a Kendo UI for Angular segmented date input: a component-library profile can now declare `dateEntry: 'digits'`, and the date is entered by typing its digits one key at a time instead of filling the formatted string, which the mask rewrote into a different date.
- ac55857: Fix `qa.browser_select_option` and the generated widget helpers on a Kendo UI for Angular multiselect: wait for a popup's animation before clicking an option and before deciding it needs closing (a pressed Escape dropped the choice just made), and open the multiselect through its input instead of its middle, where a chip sits.
- 06c0685: `qa.browser_select_option` no longer fails when the list closes itself between finding an option and clicking it. The first click is bounded to five seconds; if it cannot land, the popup is reopened and the click repeated once with the full action timeout, and that second failure is the one reported. The option helpers in a generated locator module do the same.
- 8b52efc: Choosing an option of a list widget (`qa.browser_select_option` and the generated widget helpers) is made once more when the widget does not show the choice at first, as it can on a loaded machine. A widget that still does not show it is reported as before.
- Updated dependencies [32bdb52]
- Updated dependencies [dfafb00]
- Updated dependencies [d6dfc44]
- Updated dependencies [c3967a9]
- Updated dependencies [f664f1c]
- Updated dependencies [2e4885c]
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
- Updated dependencies [ed23378]
- Updated dependencies [87e1cca]
- Updated dependencies [210e92b]
- Updated dependencies [bea8a20]
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
