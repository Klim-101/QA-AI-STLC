# @qa-ai-stlc/cli

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
