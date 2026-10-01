---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/runner-api': minor
'@qa-ai-stlc/runner-playwright': minor
---

Authenticate API specs through `apiAuth` profiles. The engine generates `tests/qa/api-auth.ts` (when an `api` spoke input is built, before a generated spec is typechecked, and before an API run); a spec calls `request.get(url, apiAuth('<profile>'))` and the profile name is a literal union, so an unknown profile fails typechecking. `runner-api` resolves the profiles a spec names, hands them to the Playwright process through its environment only, refuses to do so for a base URL outside the environment's allowlist, and scrubs the credential values from the failures it reports. A spec that carries a credential of its own (an `Authorization` or `Cookie` header, a header or query parameter a profile uses, or a `Bearer`/`Basic` value) is rejected with `HTTP_CREDENTIAL_INPUT_REJECTED` before it runs. A run that carries a credential records no Playwright trace, because a trace archive holds request headers and cannot be scrubbed. `ProcessRunOptions` gains `env` and `runPlaywrightSpecs` takes `env` and `isTraceEnabled`.
