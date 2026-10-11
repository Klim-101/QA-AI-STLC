# @qa-ai-stlc/runner-security

The black-box security audit engine. It is an on-demand capability outside the regular pipeline:
it runs only when `testing.security` is `in-scope` and only after the operator approved an
authorization (environment, checks, identities, prohibited actions, the exact mutations allowed,
rate limit and request budget). The approval is bound to the authorization's content and to the
environment's address and allowlist, so editing either withdraws it.

Every check reaches the application through one probe, which holds the authorized limits: nothing
outside the authorized origin, no request that is not a read unless the authorization names that
exact method and path, no faster than the rate limit, no more than the request budget, and no
redirect followed. Every request, sent or refused, is logged in the audit result.

## Checks

| Class      | What it looks at                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headers`  | Content-Security-Policy, nosniff, framing protection, HSTS (HTTPS only), Referrer-Policy, a framework or version named in `Server` / `X-Powered-By`                                                                                |
| `cookies`  | HttpOnly, Secure (HTTPS only) and SameSite on every cookie set for an anonymous visitor; cookie values are never recorded. A session cookie is usually set only by a sign-in, so without a cookie before sign-in this is `skipped` |
| `cors`     | Whether a foreign origin or the `null` origin is allowed, and whether with credentials                                                                                                                                             |
| `errors`   | Stack traces, database errors and framework banners in a missing-page and a malformed-escape response                                                                                                                              |
| `encoding` | Whether the usual query parameters are written into a page unencoded. A clean result is `uncertain`: the parameters the application really reads are not discovered                                                                |

| `csrf` | Replays each mutation the authorization names, with the identity's session, a foreign `Origin` and no anti-forgery token. The authorization should carry a complete request body the operator vouches for, otherwise a refusal is `uncertain`. The sign-out path is never replayed |
| `authz` | Opens each restricted route as the identity that may, as the one that must not (role `low`), and with no session. First confirms the low identity's session is alive, because a dead one is refused everywhere |
| `session` | Signs out and replays the old session cookie on a page that tells signed-in from anonymous; it ends the identity's session, so it runs after the checks that use it |

Identities sign in through the saved storage state under `.qa/auth/`, or through `authenticate()` (a scripted login whose page must be inside the authorized origin, or an attached Chrome). An identity that cannot sign in makes the checks that need it `blocked`, not `passed`.

## Code-assisted level

When `source.path` is set, three more classes read the application's source checkout. They run only
when the authorization names them, and they only read: the checkout is exposed without any write,
directories such as `node_modules`, `dist` and `.git` are left out, and binary or oversized files are
counted but not read. Findings carry `codeReferences` (project-relative file and line), which the
defect draft lists under "Code references".

| Class           | What it looks at                                                                                                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dependencies`  | `npm audit` over the lockfile (found at or above `source.path`; a workspace is audited on its own). It sends package names and versions to the configured package registry, so naming the class is also consent to that. Other package managers are `skipped`; an audit that cannot run is `blocked`  |
| `secrets`       | Provider key shapes, private key headers, JWTs, bearer tokens, password and API key assignments, and secrets with a literal value or literal fallback. Only the kind of secret and where it is are reported, never the value. A match in test code or sample data has low confidence                  |
| `configuration` | Debug and test-only routes, debug mode, cookies without HttpOnly or Secure, disabled certificate verification, a wildcard CORS origin. A setting beside an environment check (`NODE_ENV`) is not reported. These are patterns in text, so a clean result is `uncertain` and test code is not examined |

Without `source.path`, or when it points at nothing, these classes are `skipped` with a note and the
audit logs a notice that it ran black-box only.

A check ends `passed`, `failed`, `skipped`, `blocked` or `uncertain`; the last three are never
reported as `passed`, and an audit with a blocked check or an exhausted budget is `partial`.
Findings become tracker-neutral defect drafts with `category: security`; accepting them is the
ordinary defect gate.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
