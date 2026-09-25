# @qa-ai-stlc/core

The deterministic engine underneath the `qa` CLI and the MCP server. This package owns the
`.qa/` store: reading and validating `config.yaml`, hashing every registered artifact into
`manifest.json`, and normalizing project-relative paths so a hash or a reference recorded on one
OS still resolves on another. `GateStateMachine` is the pipeline's hash-bound approval gate
(ADR-003): an artifact's content is hashed into `artifacts/approval-ledger.json` at approval time,
and every gate's live status in `state.json` is recomputed from that ledger, never trusted as a
cached field, so editing an approved artifact reopens its gate automatically.

It also owns the browser sessions an agent drives through the MCP `browser.*` tools (ADR-005):
`BrowserSessionStore` holds the live sessions, safe mode aborts every non-GET request by default
(an opt-in `executionMode` on `qa.browser_open` relaxes this for interactive case execution,
ADR-0009 — the domain allowlist still applies unconditionally either way), and every action is
registered through `EvidenceStore` before the operation returns.

Interactive case execution (P3-14) proves an approved test case actually works before any code is
generated: `runRegisterExecutedElement` promotes an ad hoc element pick into the selector registry
as `source: 'execute'`, `runHttpExecute` makes a real HTTP call for the `api` test type, and
`runBrowserAccessibilityScan` runs a real `axe-core` scan for `a11y` — all three register evidence
the same way browser actions do, and `runRegisterCaseResult` ties that evidence into a run result.

`runTestRun` (`qa run` / MCP `qa.run`, P3-04) drives the `Runner` interface a test-type package
implements (`@qa-ai-stlc/runner-playwright` for `e2e`): a runner never writes evidence itself, it
returns raw evidence (a screenshot, a trace) alongside each `RunResult` it produces, and
`runTestRun` registers it through the same `EvidenceStore` (P3-03, ADR-004). A `failed` result
that ends up with no registered evidence — every item quarantined, or the runner captured none —
fails the run with `RUN_RESULT_MISSING_EVIDENCE` rather than persisting an unbacked failure.

`runReport` (`qa report` / MCP `qa.report`, P3-08, ADR-002) renders a run's summary and the
current requirement → case → result → evidence traceability matrix — every requirement in
`scope.json`, every case that links to it, and each case's most recent run result across every
run recorded — as Markdown or HTML, through the same `renderMarkdownArtifact`/`renderHtmlArtifact`
registries `qa cases render` uses. Every byte comes from canonical JSON already under `.qa/`; no
report is ever hand-written.

`runValidate`'s opt-in `checkRuns` (`qa validate --run` / MCP `qa.validate` with `checkRuns:
true`, P3-09) sweeps every recorded `RunResult` — from `qa run` or from interactive case
execution alike — for an `evidenceIds` entry with no matching registered evidence file (a
fabricated link) and for a `failed` result with none at all, independent of which write path
produced the result.

The generation contract (P3-05, ADR-0010) fixes what a future `qa-generate-tests` spoke (P3-07)
will exchange with the hub: `buildGenerationSpokeInput`/`buildRegistrySlice` assemble a case, a
filtered slice of the selector registry and the locator module's current export list into a
`GenerationSpokeInput`; `stampGeneratedTestSpec`/`isGeneratedTestSpecStale` stamp and later check a
generated spec's `sourceHash` against that input. `extractManualRegions`/`applyManualRegions`
round-trip a human's hand-written `// qa:manual:start <id>` / `// qa:manual:end <id>` blocks across
regeneration, reused unchanged by the verification loop (P3-06) and `qa upgrade` (P7-01).

`verifyGeneratedTestSpec` (P3-06, development plan section 5.2) is the framework's primary quality
mechanism: a spoke's generated spec is never registered on trust. Its content is typechecked
against a fixed TypeScript baseline (a real `tsc --noEmit` spawn against a scratch copy placed
beside the real target so its imports resolve) and, only if that passes, executed once through the
injected `Runner`. Either failure returns `SpokeValidationIssue[]` in the same shape
`SpokeErrorSchema.issues` already uses, reusing `RunResultSchema`'s own `failure`/`missingStepIds`
fields to name exactly which step failed — no new failure-identity mechanism. Only a
`'verified'` outcome can be passed to `registerVerifiedGeneratedTestSpec`, enforced by the type
system, which then writes the spec to its real path and registers it in the manifest, the same
"write to the project tree, then `manifest.register`" pattern ADR-006 established for the locator
module. `hasVerificationRetryBudget` reads the existing `config.agents.retries` field; the retry
loop itself — re-dispatching the generating spoke with a failed outcome's `issues` — is a hub
responsibility, since regenerating the spec is a model call the engine never makes.

Filesystem access, wall-clock time, identifier generation and logging are injected through small
ports (`FileSystem`, `Clock`, `IdGenerator`, `Logger`) rather than called directly, so the engine's logic is testable without real
I/O and so hosts (CLI, MCP server, tests) can supply their own implementations.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
