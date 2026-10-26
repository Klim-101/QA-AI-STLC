# @qa-ai-stlc/runner-a11y

## 1.14.2

### Patch Changes

- Updated dependencies [6e36036]
  - @qa-ai-stlc/core@1.14.2
  - @qa-ai-stlc/runner-playwright@1.14.2

## 1.14.1

### Patch Changes

- Updated dependencies [29bc53b]
- Updated dependencies [483a711]
  - @qa-ai-stlc/core@1.14.1
  - @qa-ai-stlc/runner-playwright@1.14.1

## 1.14.0

### Patch Changes

- Updated dependencies [1d566ab]
- Updated dependencies [7e5b155]
- Updated dependencies [256380c]
- Updated dependencies [caf298b]
- Updated dependencies [14cadbb]
- Updated dependencies [3026937]
  - @qa-ai-stlc/core@1.14.0
  - @qa-ai-stlc/runner-playwright@1.14.0

## 1.13.0

### Patch Changes

- Updated dependencies [ad5e756]
- Updated dependencies [b1c61d1]
- Updated dependencies [5cc4ac7]
- Updated dependencies [626f41c]
- Updated dependencies [9f40a76]
  - @qa-ai-stlc/core@1.13.0
  - @qa-ai-stlc/runner-playwright@1.13.0

## 1.12.1

### Patch Changes

- Updated dependencies [eecace0]
- Updated dependencies [06816a0]
- Updated dependencies [54311ad]
- Updated dependencies [1d82f20]
- Updated dependencies [d535bda]
- Updated dependencies [4dc2110]
  - @qa-ai-stlc/core@1.12.1
  - @qa-ai-stlc/runner-playwright@1.12.1

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
- Updated dependencies [4b76336]
- Updated dependencies [00fe126]
- Updated dependencies [1a5e8e2]
- Updated dependencies [40cbef8]
  - @qa-ai-stlc/core@1.12.0
  - @qa-ai-stlc/runner-playwright@1.12.0

## 1.11.0

### Patch Changes

- Updated dependencies [ff04ffd]
- Updated dependencies [c874bfb]
- Updated dependencies [2087fda]
- Updated dependencies [a55b57f]
  - @qa-ai-stlc/core@1.11.0
  - @qa-ai-stlc/runner-playwright@1.11.0

## 1.10.0

### Patch Changes

- Updated dependencies [4810691]
- Updated dependencies [ad08f4a]
- Updated dependencies [5aab58c]
- Updated dependencies [d2ede91]
  - @qa-ai-stlc/core@1.10.0
  - @qa-ai-stlc/runner-playwright@1.10.0

## 1.9.0

### Minor Changes

- 6e64902: Browser specs can now run against a site that needs sign-in. `qa run`, `qa.run` and `qa.generation_verify` sign in as a configured identity and start the browser with its session, so a spec carries no credential and no login steps. The identity is `--identity` / `identity` on the call, else the new `environments.<name>.identity` in `config.yaml`; with neither the run is anonymous. The run record, the run summary and the verification result name the identity used. The session exists only for the run (traces are off for it) and is never written to a report, log or artifact. A login that does not take stops the run with `RUN_SIGN_IN_FAILED` and a remediation, instead of running the specs against the login page; an unknown identity is `RUN_IDENTITY_UNKNOWN`.

### Patch Changes

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
  - @qa-ai-stlc/runner-playwright@1.9.0

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
  - @qa-ai-stlc/runner-playwright@1.8.0

## 1.7.0

### Patch Changes

- Updated dependencies [f6dd64c]
- Updated dependencies [05ec635]
- Updated dependencies [597ec65]
- Updated dependencies [62612a1]
- Updated dependencies [2663897]
- Updated dependencies [3ef1938]
  - @qa-ai-stlc/core@1.7.0
  - @qa-ai-stlc/runner-playwright@1.7.0

## 1.6.0

### Minor Changes

- 68f1be0: Add `@qa-ai-stlc/runner-a11y` and route `qa run --test-type a11y` (MCP `qa.run`) through it. An accessibility spec is an ordinary Playwright test that navigates and calls the generated `scanAccessibility(page, testInfo)` helper (`tests/qa/a11y-scan.ts`); the engine hands the helper the axe-core plan derived from the `a11y` configuration, registers each scan as `a11y-scan` evidence with exceptions applied, and sets the case's status from it: violations fail the case, `incomplete` results leave it `uncertain`, and a case that never scanned is rejected with `RUNNER_A11Y_NO_SCAN`. `qa run` and `qa.run` no longer answer `RUN_TEST_TYPE_UNSUPPORTED` for `a11y`.

### Patch Changes

- Updated dependencies [32bdb52]
- Updated dependencies [dfafb00]
- Updated dependencies [dc289ad]
- Updated dependencies [ac55857]
- Updated dependencies [a6bc034]
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
  - @qa-ai-stlc/core@1.6.0
  - @qa-ai-stlc/runner-playwright@1.6.0
