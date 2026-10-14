# @qa-ai-stlc/runner-playwright

Implements the `Runner` interface (`@qa-ai-stlc/core`) for `e2e` test cases (ADR-004: the engine
owns the browser). Given a spec set — absolute paths to hand-written or generated Playwright
`.spec.ts` files — it spawns the real Playwright Test runner directly through its resolved CLI
entry point (no `npx`, no shell), against an ephemeral, import-free config it generates so a spec's
own `node_modules` resolution is never affected, then parses the real JSON report the run produces
into validated `RunResult` values.

A test case id is read from a `testCaseId` annotation on the spec itself:

```ts
test(
  'user can log in',
  { annotation: { type: 'testCaseId', description: 'demo-app-login' } },
  async ({ page }) => {
    // ...
  },
);
```

A test with no such annotation makes `run()` throw a `QaError` — the engine never guesses which
case a result belongs to.

`run()` returns a `RunnerOutcome` per result — the `RunResult` paired with whatever raw evidence
(a screenshot, a trace) Playwright captured for it. Screenshot-on-failure and trace-on-failure
capture are always on; this runner never writes evidence to disk itself (`RunResult.evidenceIds`
is always empty coming out of it) — the caller (`qa run` / MCP `qa.run`, via `runTestRun`)
registers the returned evidence through `EvidenceStore` and fills in `evidenceIds` (P3-03,
ADR-004).

When `RunnerInput.identity` is set, the runner signs in as that configured identity before the
specs start and hands Playwright the resulting session as `storageState`. The session file lives in
the run's temporary directory only until the run ends, traces are turned off for the run (a trace
records every request's cookies), and a login that produced no session fails with
`RUN_SIGN_IN_FAILED` instead of running the specs against the login page (P6-89).

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
