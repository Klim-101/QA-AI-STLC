# @qa-ai-stlc/runner-playwright

## 0.2.0

### Minor Changes

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
- 43c1c0e: Add the `Runner` interface (`@qa-ai-stlc/core`) and `@qa-ai-stlc/runner-playwright`, its Playwright
  implementation for `e2e` test cases (P3-01, ADR-004). Given a spec set of absolute paths to
  Playwright `.spec.ts` files, `playwrightRunner.run()` spawns the real Playwright Test runner
  directly through its resolved CLI entry point against an ephemeral, import-free config, then maps
  the real JSON report it produces to validated `RunResult` values. A spec attributes its result to a
  test case with a `testCaseId` annotation (`test(title, { annotation: { type: 'testCaseId',
description: '<id>' } }, ...)`); a spec with none makes `run()` throw rather than guess. Evidence
  capture during runs is P3-03, not this package — every result's `evidenceIds` is empty for now.
- d72dc03: Add step/expected-result coverage tracking (P3-02). `RunResultSchema` gains an optional
  `missingStepIds` field, required and non-empty exactly when `status` is `'partial'`. A Playwright
  spec opts a test into coverage tracking with a `stepIds` annotation (`{ type: 'stepIds',
description: '<comma-separated ids>' }`) and titles each `test.step()` call `[<id>] <description>`;
  `playwrightRunner` parses the real JSON report's step titles and, when a `passed` or `failed` test
  did not reach every declared step, reports it as `partial` with the missing IDs instead of claiming
  a verdict the run never fully reached. A test with no `stepIds` annotation is unaffected.

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
