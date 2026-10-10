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

A check ends `passed`, `failed`, `skipped`, `blocked` or `uncertain`; the last three are never
reported as `passed`, and an audit with a blocked check or an exhausted budget is `partial`.
Findings become tracker-neutral defect drafts with `category: security`; accepting them is the
ordinary defect gate.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
