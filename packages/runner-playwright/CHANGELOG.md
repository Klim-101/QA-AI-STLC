# @qa-ai-stlc/runner-playwright

## 1.14.1

### Patch Changes

- 483a711: `qa run` (and MCP `qa.run`) can bound parallelism and the per-test timeout with `--workers <n>` and `--timeout-ms <ms>` (`workers`, `testTimeoutMs`). Without them Playwright's defaults still apply, so a large spec set against a slow application no longer has to fail with 30-second timeouts that disappear in smaller batches.
- Updated dependencies [29bc53b]
- Updated dependencies [483a711]
  - @qa-ai-stlc/core@1.14.1
  - @qa-ai-stlc/schemas@1.14.1

## 1.14.0

### Patch Changes

- Updated dependencies [1d566ab]
- Updated dependencies [7e5b155]
- Updated dependencies [256380c]
- Updated dependencies [caf298b]
- Updated dependencies [14cadbb]
- Updated dependencies [3026937]
  - @qa-ai-stlc/core@1.14.0
  - @qa-ai-stlc/schemas@1.14.0

## 1.13.0

### Minor Changes

- b1c61d1: An environment can pin the language of its browser contexts with `locale`, a BCP 47 tag such as `en-US`. Exploring, picking, the interactive browser session, signing in, and running or verifying a generated spec all use it, so the text of the application, and with it element names and text locators, no longer depends on the machine running the engine. Set it with `qa config add environment --locale <tag>` or the `locale` input of `qa.config_add`; an invalid tag is rejected. Leaving it out keeps today's behavior: the machine's own language applies, so existing projects are unchanged. The security audit's sign-in still uses the machine's language.

### Patch Changes

- Updated dependencies [ad5e756]
- Updated dependencies [b1c61d1]
- Updated dependencies [5cc4ac7]
- Updated dependencies [626f41c]
- Updated dependencies [9f40a76]
  - @qa-ai-stlc/core@1.13.0
  - @qa-ai-stlc/schemas@1.13.0

## 1.12.1

### Patch Changes

- Updated dependencies [eecace0]
- Updated dependencies [06816a0]
- Updated dependencies [54311ad]
- Updated dependencies [1d82f20]
- Updated dependencies [d535bda]
- Updated dependencies [4dc2110]
  - @qa-ai-stlc/schemas@1.12.1
  - @qa-ai-stlc/core@1.12.1

## 1.12.0

### Patch Changes

- Updated dependencies [0d13f55]
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

## 1.11.0

### Patch Changes

- Updated dependencies [ff04ffd]
- Updated dependencies [c874bfb]
- Updated dependencies [2087fda]
- Updated dependencies [a55b57f]
  - @qa-ai-stlc/schemas@1.11.0
  - @qa-ai-stlc/core@1.11.0

## 1.10.0

### Patch Changes

- Updated dependencies [4810691]
- Updated dependencies [ad08f4a]
- Updated dependencies [c0e163c]
- Updated dependencies [5aab58c]
- Updated dependencies [d2ede91]
  - @qa-ai-stlc/core@1.10.0
  - @qa-ai-stlc/schemas@1.10.0

## 1.9.0

### Minor Changes

- 6e64902: Browser specs can now run against a site that needs sign-in. `qa run`, `qa.run` and `qa.generation_verify` sign in as a configured identity and start the browser with its session, so a spec carries no credential and no login steps. The identity is `--identity` / `identity` on the call, else the new `environments.<name>.identity` in `config.yaml`; with neither the run is anonymous. The run record, the run summary and the verification result name the identity used. The session exists only for the run (traces are off for it) and is never written to a report, log or artifact. A login that does not take stops the run with `RUN_SIGN_IN_FAILED` and a remediation, instead of running the specs against the login page; an unknown identity is `RUN_IDENTITY_UNKNOWN`.

### Patch Changes

- edbb652: The Playwright runner now runs a spec set with the `@playwright/test` the specs themselves resolve, and falls back to its bundled copy only when none is reachable. When the engine ran from an `npx` cache and the project had its own Playwright, the spec registered its tests with a copy nobody was running, Playwright found zero tests, and `qa.generation_verify` ended in `core.verification.unexpected_outcome_count` (and `qa run` in `RUN_NO_RESULTS`). A spec that fails to load now ends in `RUNNER_NO_TESTS_RAN` with Playwright's own message, and the verification error names the spec, the project root and the environment.
- Updated dependencies [b9e9efc]
- Updated dependencies [cd6d619]
- Updated dependencies [26818b4]
- Updated dependencies [d75348b]
- Updated dependencies [6cbe958]
- Updated dependencies [2c0a81f]
- Updated dependencies [48f9f7d]
- Updated dependencies [6e64902]
- Updated dependencies [edbb652]
- Updated dependencies [8a00424]
  - @qa-ai-stlc/core@1.9.0
  - @qa-ai-stlc/schemas@1.9.0

## 1.8.0

### Patch Changes

- Updated dependencies [585653b]
- Updated dependencies [6160291]
- Updated dependencies [b1d0516]
- Updated dependencies [c1f6ed4]
- Updated dependencies [e78749c]
- Updated dependencies [c0707e2]
- Updated dependencies [940b19d]
- Updated dependencies [48e3c2f]
- Updated dependencies [dafa6ab]
  - @qa-ai-stlc/core@1.8.0
  - @qa-ai-stlc/schemas@1.8.0

## 1.7.0

### Patch Changes

- 3ef1938: Generated-spec verification no longer accepts empty named steps. When a run has a canonical step set (verification), a Playwright reporter records, from the step categories Playwright itself reports, how many actions and assertions each `[id]` step contains. A step with neither is reported like a step that did not run (`partial`, with the idle steps named), and the expected result needs a real check: a web-first assertion for a browser test, any assertion for an API test. A spec of empty `test.step()` calls, or one whose only check is `expect(true).toBe(true)`, is no longer `verified`.
- Updated dependencies [f6dd64c]
- Updated dependencies [05ec635]
- Updated dependencies [597ec65]
- Updated dependencies [62612a1]
- Updated dependencies [2663897]
- Updated dependencies [3691ab0]
- Updated dependencies [3ef1938]
  - @qa-ai-stlc/core@1.7.0
  - @qa-ai-stlc/schemas@1.7.0

## 1.6.0

### Minor Changes

- 9fd9564: Authenticate API specs through `apiAuth` profiles. The engine generates `tests/qa/api-auth.ts` (when an `api` spoke input is built, before a generated spec is typechecked, and before an API run); a spec calls `request.get(url, apiAuth('<profile>'))` and the profile name is a literal union, so an unknown profile fails typechecking. `runner-api` resolves the profiles a spec names, hands them to the Playwright process through its environment only, refuses to do so for a base URL outside the environment's allowlist, and scrubs the credential values from the failures it reports. A spec that carries a credential of its own (an `Authorization` or `Cookie` header, a header or query parameter a profile uses, or a `Bearer`/`Basic` value) is rejected with `HTTP_CREDENTIAL_INPUT_REJECTED` before it runs. A run that carries a credential records no Playwright trace, because a trace archive holds request headers and cannot be scrubbed. `ProcessRunOptions` gains `env` and `runPlaywrightSpecs` takes `env` and `isTraceEnabled`.
- 68f1be0: Add `@qa-ai-stlc/runner-a11y` and route `qa run --test-type a11y` (MCP `qa.run`) through it. An accessibility spec is an ordinary Playwright test that navigates and calls the generated `scanAccessibility(page, testInfo)` helper (`tests/qa/a11y-scan.ts`); the engine hands the helper the axe-core plan derived from the `a11y` configuration, registers each scan as `a11y-scan` evidence with exceptions applied, and sets the case's status from it: violations fail the case, `incomplete` results leave it `uncertain`, and a case that never scanned is rejected with `RUNNER_A11Y_NO_SCAN`. `qa run` and `qa.run` no longer answer `RUN_TEST_TYPE_UNSUPPORTED` for `a11y`.
- 210e92b: Add `@qa-ai-stlc/runner-api` and route `qa run --test-type api` (MCP `qa.run`) through it. Before any spec runs it loads the OpenAPI 3.x contract named by `api.source` and checks every case the spec declares: the case must be an `api` case listing the contract operations it exercises in the new optional `endpoints` field, and every one must exist in the contract, otherwise the run is rejected with `API_CASE_NOT_IN_CONTRACT` before a request is sent. The contract text is stored as `artifacts/api-contract.txt` and registered in the manifest. Contract loading and OpenAPI parsing move from the explorer into `@qa-ai-stlc/core` (`loadApiContract`), and contract URLs and discovery probes are now checked against the environment's scheme and port as well as its hostname.

### Patch Changes

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
- Updated dependencies [c7d5747]
- Updated dependencies [552493f]
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

## 1.5.0

### Patch Changes

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
- Updated dependencies [a9488cb]
- Updated dependencies [16b80d4]
- Updated dependencies [fbbbab7]
  - @qa-ai-stlc/core@1.5.0
  - @qa-ai-stlc/schemas@1.5.0

## 1.4.0

### Patch Changes

- Updated dependencies [97a57f7]
  - @qa-ai-stlc/core@1.4.0
  - @qa-ai-stlc/schemas@1.4.0

## 1.3.0

### Patch Changes

- ddd1bcd: `verifyGeneratedTestSpec` now requires the `TestCase` a generated spec claims to codify and checks
  execution coverage against that case's own canonical step/expected-result ids (`canonicalStepIds`),
  never the spec's own self-declared `stepIds` annotation. Previously coverage was checked only
  against what the candidate spec itself chose to declare, so a spec with an empty body (only a
  `testCaseId` annotation, no assertions, no `stepIds` declaration) reported `passed` and was accepted
  as `'verified'`. `Runner.run()` gained an optional `requiredStepIds` input that
  `runner-playwright`'s `mapReportToRunResults` honors as the authoritative required set when given,
  overriding the spec's own declaration; ordinary `qa run` over hand-written specs is unaffected.
- Updated dependencies [6d5c9da]
- Updated dependencies [efb7692]
- Updated dependencies [ddd1bcd]
- Updated dependencies [6c06b46]
- Updated dependencies [535e2e9]
- Updated dependencies [592d606]
- Updated dependencies [671249f]
  - @qa-ai-stlc/core@1.3.0
  - @qa-ai-stlc/schemas@1.3.0

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
