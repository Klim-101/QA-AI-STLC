# @qa-ai-stlc/runner-api

## 1.6.1

### Patch Changes

- Updated dependencies [f6dd64c]
- Updated dependencies [05ec635]
- Updated dependencies [597ec65]
- Updated dependencies [3ef1938]
  - @qa-ai-stlc/core@1.6.1
  - @qa-ai-stlc/runner-playwright@1.6.1
  - @qa-ai-stlc/schemas@1.6.1

## 1.6.0

### Minor Changes

- 9fd9564: Authenticate API specs through `apiAuth` profiles. The engine generates `tests/qa/api-auth.ts` (when an `api` spoke input is built, before a generated spec is typechecked, and before an API run); a spec calls `request.get(url, apiAuth('<profile>'))` and the profile name is a literal union, so an unknown profile fails typechecking. `runner-api` resolves the profiles a spec names, hands them to the Playwright process through its environment only, refuses to do so for a base URL outside the environment's allowlist, and scrubs the credential values from the failures it reports. A spec that carries a credential of its own (an `Authorization` or `Cookie` header, a header or query parameter a profile uses, or a `Bearer`/`Basic` value) is rejected with `HTTP_CREDENTIAL_INPUT_REJECTED` before it runs. A run that carries a credential records no Playwright trace, because a trace archive holds request headers and cannot be scrubbed. `ProcessRunOptions` gains `env` and `runPlaywrightSpecs` takes `env` and `isTraceEnabled`.
- f664f1c: Generate API specs through the verification loop. For an `api` case, `qa.generation_spoke_input` returns `apiContract` (the contract operations the case names, plus the contract SHA-256) instead of a registry slice and locator module, and `qa.generation_verify` runs the spec through `runner-api`. A generated API spec must declare `export const CONTRACT_SHA256 = "<hash>"`: verification rejects a spec that does not match the input's hash, and `runner-api` rejects a spec once the live contract hashes differently (`API_SPEC_CONTRACT_CHANGED`). `registrySlice` and `locatorModule` are now optional in the spoke input schema and required only for non-`api` cases. The `qa-generate-tests` skill documents the API flow.
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
  - @qa-ai-stlc/runner-playwright@1.6.0
