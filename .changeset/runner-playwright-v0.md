---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/runner-playwright': minor
---

Add the `Runner` interface (`@qa-ai-stlc/core`) and `@qa-ai-stlc/runner-playwright`, its Playwright
implementation for `e2e` test cases (P3-01, ADR-004). Given a spec set of absolute paths to
Playwright `.spec.ts` files, `playwrightRunner.run()` spawns the real Playwright Test runner
directly through its resolved CLI entry point against an ephemeral, import-free config, then maps
the real JSON report it produces to validated `RunResult` values. A spec attributes its result to a
test case with a `testCaseId` annotation (`test(title, { annotation: { type: 'testCaseId',
description: '<id>' } }, ...)`); a spec with none makes `run()` throw rather than guess. Evidence
capture during runs is P3-03, not this package — every result's `evidenceIds` is empty for now.
