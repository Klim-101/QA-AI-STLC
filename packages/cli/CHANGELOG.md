# @qa-ai-stlc/cli

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
