# ADR-0018: Safe mode lets the safe HTTP methods through

Status: Accepted
Date: 2026-10-19

## Context

Safe mode (AGENTS.md 12.4, ADR-005) aborts every request a browser session or an exploration makes
unless its method is `GET`. The rule is meant to stop a click from changing the application under
test, and a `GET` is the method everyone expects to read only.

Exploring a public sample shop showed a read that the rule also stops. Its product list and its
category tree are fetched with `QUERY`, the HTTP method for a read whose parameters travel in a
request body. Safe mode aborted 49 such requests in one run, so the pages came out without their
products and the registry was built from empty screens. `QUERY` is defined as safe and idempotent,
exactly like `GET`; it is only newer. `safeNonGetRequests` (ADR-0014) cannot help: it admits `POST`
only, on purpose, and a read does not need a written reason per path.

The method decision lives in more than one place. The browser handler compares with `GET`. The
security audit's probe keeps its own list (`GET`, `HEAD`, `OPTIONS`) for what counts as a read. Two
lists drift apart, and a method one path calls a read and another calls a mutation makes the
engine's own guarantee depend on which path a request took (AGENTS.md 12.7).

## Decision

The engine has one definition of a safe method, `SAFE_HTTP_METHODS` in `@qa-ai-stlc/core`: `GET`,
`HEAD`, `OPTIONS` and `QUERY`. Safe mode lets a request with one of these methods through, subject
to the domain allowlist, which still applies to every request; every other method is aborted as
before. The browser safe-mode handler and the security probe both use this definition.

- The comparison is exact and case-sensitive. A server treats `query` and `QUERY` as different
  methods, and a method written in another case is not one the definition vouches for.
- `TRACE` is not on the list although it is a safe method in RFC 9110: it reflects a request back
  to the page and has no use in testing an application.
- `safeNonGetRequests` stays `POST` only (ADR-0014), and `allowMutations` (ADR-0009) is unchanged.
  Neither is needed for a safe method.
- Applications that depend on a safe method other than these four are not served until the
  definition is extended by a new decision.

## Consequences

The guarantee of safe mode changes from "sends only `GET`" to "sends only safe-method requests".
It rests on the application honouring the meaning of the method, as it already did for `GET`: a
server that changes data on a `GET`, a `HEAD` or a `QUERY` breaks the guarantee, and the engine
cannot tell. `QUERY` is newer, so fewer servers implement it, but one that does and mutates is
non-conforming in the same way as a `GET` that mutates.

Widening to `HEAD` and `OPTIONS` was not needed by the case that prompted this decision. It is
included because the security probe already treats them as reads, and keeping a second, narrower
list for the browser is the divergence the decision removes. Browsers send a CORS preflight as an
`OPTIONS` request; the exploration that prompted this decision blocked none, so the change is not
expected to alter what a page does there.

Rejected: allowing only `QUERY` (the two lists would still differ); a per-environment list of safe
methods (a method is safe by definition, not by the operator's say-so, and a list per environment
is configuration to maintain for no gain); keeping `GET` only and asking operators to attach a
signed-in browser (the engine then cannot explore an application that reads with `QUERY` at all).

Not covered here: the API surface (`endpoints.json`) and the OpenAPI contract comparison know the
methods of `HttpMethodSchema`, which does not include `QUERY`. A `QUERY` request that now goes
through is therefore not recorded as an endpoint. That is a separate change to a persisted schema.
