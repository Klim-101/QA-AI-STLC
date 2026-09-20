# ADR-008: Tiered coverage thresholds by package trust level

Status: Accepted
Date: 2026-09-20

## Context

`vitest.config.ts` enforces 100% statement/branch/function/line coverage, uniformly, on every
package (AGENTS.md §13: a threshold is raised as coverage improves, never lowered to make a change
pass). Through Phase 0 and Phase 1 this held without strain, because every package built so far —
`schemas`, `core`, `explorer`, `cli`, `test-utils` — is either pure validation/decision logic
(schema rules, gates, locator synthesis, config parsing) or a thin, fully-owned wrapper around one
well-understood dependency (Playwright, via `core`'s `BrowserLauncher` port). A missed branch in
that code is a missed _decision_ — exactly the kind of gap 100% coverage exists to catch, since a
bug there is silent: a gate that does not actually block, a selector that resolves to the wrong
element, a config value accepted that the schema should have rejected.

Phase 2 adds `packages/mcp-server` (P2-04): a stdio protocol server whose job is largely
plumbing — parsing a client's request, validating arbitrary tool input against a schema, mapping
every third-party/protocol failure mode into a structured error. Phase 3+ adds `packages/runner-*`,
each wrapping a third-party tool (Playwright test execution, axe-core, an HTTP client) with a
similar shape: most of the branch count is defensive handling of that tool's own failure modes, not
this project's own decision logic. A bug in this class of code tends to fail loudly — a thrown
error the caller sees immediately — rather than silently produce a wrong QA result. Holding every
defensive branch of third-party integration code to the same 100% bar as a gate or a schema has a
different, and worse, cost-to-signal ratio: each additional percentage point increasingly means
constructing a contrived failure from a third-party library rather than testing this project's own
logic.

Because the coverage threshold can only be raised, never lowered, this had to be decided before
`packages/mcp-server` or the first `runner-*` package exists. Once CI has already forced a package
to 100%, retiring that bar later is against the project's own policy — there would be no honest way
to introduce a lower tier without either violating the ratchet rule or grandfathering an exception
that undermines it for everyone.

## Decision

Coverage thresholds in `vitest.config.ts` are split into two tiers, by what a package is
responsible for rather than by blanket default:

- **Tier 1 — trust-critical (100% statements/branches/functions/lines, unchanged):**
  `packages/schemas`, `packages/core`, `packages/explorer`, `packages/cli`, `packages/test-utils`.
  Anything whose job is validation, state, or a decision the pipeline relies on. Stays exactly
  where it is today; nothing here is lowered.
- **Tier 2 — integration and third-party-tool plumbing (90% statements/lines/functions, 80%
  branches, as a starting bar):** `packages/mcp-server` and every `packages/runner-*`, from the
  package's creation. The same ratchet-up-only rule applies from that starting point — a Tier 2
  package's threshold rises as its own coverage improves and never drops once raised, exactly like
  Tier 1 today.

A package qualifies for Tier 2 only when its primary responsibility is protocol or third-party-tool
plumbing, not merely because it is new or because reaching 100% would be inconvenient. A future
package built around this project's own decision logic defaults to Tier 1.

## Consequences

`packages/mcp-server` and future `runner-*` packages can absorb the real, high branch-count cost of
third-party integration without every PR touching them being blocked on covering a defensive
`catch` block for a failure mode that is expensive to simulate and unlikely to hide a real bug.
Contributors get to choose where to spend test-writing effort deliberately, instead of the coverage
gate forcing effort toward whichever branch is cheapest to reach next regardless of how much it
actually verifies.

The cost is a control that a Tier 2 package's real decision logic — the parts of `mcp-server` or a
`runner-*` package that are this project's own code, not third-party plumbing — could still ship
undertested at a lower bar than the rest of the codebase, since the 90/80% split is enforced per
package, not per line of "is this plumbing or logic." Mitigation left as future scope rather than
folded into this decision (to keep it a config-and-policy change, not a new tooling dependency):
mutation testing (for example Stryker) run selectively against Tier 1 packages, to verify that
their 100% coverage is not just lines executed but assertions that actually catch a defect, was
considered and rejected as in-scope here — it addresses a different question (coverage quality) and
deserves its own decision once there is a live package to run it against.
