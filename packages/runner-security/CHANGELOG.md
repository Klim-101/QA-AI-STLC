# @qa-ai-stlc/runner-security

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

- 2c0a81f: The security audit that `runner-security` can run is now reachable on demand. `qa security authorize --path <file>`, `qa security approve --approved-by <name>` and `qa security audit` (and the MCP tools `qa.security_authorize`, `qa.security_approve`, `qa.security_audit`) register the audit authorization, record the operator's approval of its exact content, and run the authorized checks, filing every finding as a defect draft that is not accepted. All three refuse with `SECURITY_OUT_OF_SCOPE` unless `testing.security` is `in-scope`, and the audit refuses to start without an approved, current authorization. The new `qa-security` skill drafts the authorization, puts it in front of the operator, waits for their approval and reports the result; it fires only on a request for a security audit and is never called by the pipeline. `qa security audit` exits non-zero when it found something or stopped early.

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

### Minor Changes

- 62612a1: Add the code-assisted security level, used when `source.path` is set. Three new check classes, `dependencies` (`npm audit` over the lockfile), `secrets` (credentials committed with the code; the value is never reported) and `configuration` (debug and test-only routes, debug mode, cookies without HttpOnly or Secure, disabled certificate verification, a wildcard CORS origin), read the checkout through a read-only view and run only when the authorization names them. Findings now carry `codeReferences` (project-relative file and line), and a security defect draft lists them under "Code references". Without `source.path`, or when it points at nothing, the code-assisted classes are `skipped` and the audit logs a notice that it ran black-box only.
- 2663897: Foundation of the on-demand black-box security audit (no command or MCP tool yet). A security audit authorization (`SecurityAuthorizationSchema`: environment snapshot, check classes, identities, prohibited actions, the exact mutations allowed, rate limit and request budget) is registered and approved through a hash-bound `security-authorization` gate; an audit refuses to start (`SECURITY_NOT_AUTHORIZED`, `SECURITY_AUTHORIZATION_STALE`, `SECURITY_OUT_OF_SCOPE`) unless it is approved, unedited, security testing is in scope and the environment's address and allowlist still match. The new `@qa-ai-stlc/runner-security` package sends every request through one probe that enforces the authorized origin and allowlist, only the authorized non-read requests, the rate limit and the request budget, follows no redirects and logs every request sent or refused. Checks end `passed`, `failed`, `skipped`, `blocked` or `uncertain`; an audit with a blocked check or an exhausted budget is `partial`. Findings are registered as evidence and drafted as `category: security` defect drafts. `HttpClient.request()` now also returns each `Set-Cookie` header separately (`setCookies`).
- 3691ab0: Add the identity-based black-box security checks. `authz` opens each restricted route as the privileged identity, as the low-privilege one and with no session, after confirming the low identity's session is alive; `csrf` replays each authorized mutation with a valid session, a foreign `Origin` and no anti-forgery token (the sign-out path is never replayed); `session` signs out and replays the old cookie on a page that tells signed-in from anonymous; `cookies` now also reads the flags of the cookies a signed-in identity's session holds. Identities sign in through their saved storage state or `authenticate()`; one that cannot makes the checks that need it `blocked`. A mutation in the authorization can now carry the complete request `body` and `contentType` the operator vouches for, which lets a refusal count as a pass. On the demo application the audit reports its catalogued security bugs (BUG-005, BUG-010, BUG-012).
- 3fedcac: Add the passive black-box security checks: `headers` (CSP, nosniff, framing, HSTS, Referrer-Policy, technology banners), `cookies` (HttpOnly, Secure, SameSite of the cookies an anonymous visitor receives; values are never recorded), `cors` (foreign and `null` origins, with or without credentials), `errors` (stack traces, database errors and framework banners in provoked error pages) and `encoding` (usual query parameters reflected unencoded; a clean result is `uncertain`, not `passed`). `DEFAULT_SECURITY_CHECKS` lists them. All send only GET requests through the authorized probe.

### Patch Changes

- c55dae3: Publish `@qa-ai-stlc/runner-security` with the other engine packages. It was marked private, which made every changeset that names it together with a published package invalid ("mixed changeset") and kept its exact dependency pins out of step with the versions the release bumps.
- Updated dependencies [f6dd64c]
- Updated dependencies [05ec635]
- Updated dependencies [597ec65]
- Updated dependencies [62612a1]
- Updated dependencies [2663897]
- Updated dependencies [3691ab0]
- Updated dependencies [3ef1938]
  - @qa-ai-stlc/core@1.7.0
  - @qa-ai-stlc/schemas@1.7.0
