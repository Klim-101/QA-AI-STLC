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

A check ends `passed`, `failed`, `skipped`, `blocked` or `uncertain`; the last three are never
reported as `passed`, and an audit with a blocked check or an exhausted budget is `partial`.
Findings become tracker-neutral defect drafts with `category: security`; accepting them is the
ordinary defect gate.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
