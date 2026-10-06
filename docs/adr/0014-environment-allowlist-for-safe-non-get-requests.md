# ADR-0014: An environment may allow named non-GET requests in safe mode

Status: Accepted
Date: 2026-10-05

## Context

Safe mode (AGENTS.md 12.4, ADR-005) aborts every non-GET request a browser session makes. ADR-0009
relaxes that rule for one case only: an interactive case-execution session that opts in with
`executionMode`, which lets every non-GET request through. Exploration, page analysis, pick mode and
verification never relax it.

Validating Kendo UI support on a real single-page application (P6-46) showed what that costs. The
application keeps its access token in memory and, on every load, calls `POST /auth/refresh-token`
with a refresh cookie to get one. Safe mode aborts that request, so the application never obtains a
session and `qa explore` finds nothing beyond the sign-in page. The request mutates nothing the
tests care about, but the engine cannot know that, and the only ways round it today are manual:
the operator attaches a signed-in browser (`qa.browser_attach`) or runs pick mode by hand, for every
exploration, in every project whose application behaves this way. Token refresh is the common case;
sign-in itself and POST-as-query endpoints (search, GraphQL queries) are others.

`executionMode` is the wrong tool: it is all or nothing, it is per session and chosen by the caller
(an agent), and it is not available to the crawler at all.

## Decision

An environment in `config.yaml` may carry an optional `safeNonGetRequests` list. Each entry names
one request that safe mode lets through:

```yaml
environments:
  staging:
    baseUrl: https://staging.example.com
    allowlist: [staging.example.com]
    safeNonGetRequests:
      - method: POST
        path: /auth/refresh-token
        reason: Exchanges the refresh cookie for an access token; creates no business record.
```

Rules:

1. **Narrow by construction.** `method` is `POST` only (the schema rejects `PUT`, `PATCH` and
   `DELETE`, which change a named resource by definition). `path` is an exact URL path starting
   with `/`: case-sensitive, no query, no fragment, no wildcard or pattern. `reason` is required and
   at least a sentence long, so a reviewer of the config sees why.
2. **The allowlist still comes first.** A request is allowed only when its host, scheme and port pass
   the environment's allowlist check exactly as today, and then its method and path match an entry.
   An entry never widens where the session can go.
3. **One enforcement point.** Every safe-mode session reads the list through the same handler:
   crawl, page analysis, locator scoring, `--verify`, and `qa.browser_open`/`qa.browser_attach`
   sessions without `executionMode`. `executionMode` keeps its ADR-0009 meaning and is unaffected.
4. **Bodies are not inspected.** An allowed request goes out as the application made it. The engine
   records the method and the path, never the body, headers or query (AGENTS.md 5.8).
5. **Visible.** An allowed request is counted and listed by method and path in the explore report
   and in the `qa.browser_close` result, and marked as allowed by configuration in the request log.
   Requests that safe mode still blocks are summarised by method and path as well (distinct entries,
   capped), so an operator who sees the application stall can tell which request to consider
   listing, instead of reading browser developer tools.
6. **Reported as a relaxation.** The list lives in the `environments` section, which the local layer
   may set (ADR-0011). Every entry that the committed layer does not contain is a relaxation,
   reported on every CLI command, by `qa doctor`/`qa.doctor` and by `qa config show`/
   `qa.config_show`, with its path and reason.
7. **An agent cannot grant it.** `qa.config_add` and `qa.config_set` do not accept the field. The
   operator edits `config.yaml` or the local file, or passes `--allow-request` to
   `qa config add environment` on the CLI.

**Not adopted:**

- A global switch to turn safe mode off. It removes the guarantee for every request.
- Wildcard or regular-expression paths, method wildcards, and rules that look at the body. They make
  it impossible to read the list and know what can happen.
- Allowing `PUT`, `PATCH` or `DELETE`.
- Learning "safe" requests from observed traffic. The engine cannot tell a token refresh from a
  purchase; only the operator knows what an endpoint does.

## Consequences

An application that bootstraps its session with a `POST` can be explored without manual work: the
operator lists the one endpoint once, in a file that is reviewed and committed like the allowlist.

The guarantee changes from "an exploration session sends no non-GET request" to "sends only those
the committed configuration names". An operator who lists an endpoint with side effects
(`POST /api/logout`, `POST /api/orders`) makes the crawler execute it. The protection is that the
list is exact, justified in writing, visible in every report, and reported as a relaxation when it
comes from the local layer; it is not prevention. As with ADR-0011, an agent with shell access could
still edit the file, and `qa doctor` reporting it is what keeps that from being silent.

A request that safe mode blocks can break an application in ways that look like a crawler defect
(a blank page, a redirect to sign-in). Naming the blocked requests in the report is part of this
decision for that reason.

AGENTS.md 12.4 says that safe mode lets through the non-GET requests an environment lists, in
addition to the ADR-0009 exception.
