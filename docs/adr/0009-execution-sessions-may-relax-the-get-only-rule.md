# ADR-0009: Execution sessions may relax the GET-only rule

Status: Accepted
Date: 2026-09-25

## Context

Safe mode (AGENTS.md 12.4, ADR-005) aborts every non-GET request a browser session makes,
unconditionally, with no option to turn it off. That rule was written for exploration and pick
mode, where the agent is investigating an unfamiliar application and must never be able to mutate
it by accident.

P3-14 adds interactive case execution: driving an _already-approved_ test case live to prove it
actually works, before any code is generated. Many real cases — logging in, submitting a form,
completing a checkout — cannot be proven true without the mutating request the case is actually
about. Under the unconditional GET-only rule, an execution session could click every button and
fill every field and still never observe whether the application really accepted the input,
because the request itself would be silently aborted.

## Decision

`qa.browser_open` gains an opt-in `executionMode` option. When set, the session's safe-mode route
handler allows non-GET requests through instead of aborting them. The domain allowlist check is
unaffected either way — an execution session can still only reach the environment's configured
allowlist, exactly like an exploration session. `executionMode` defaults to off, so every existing
caller (exploration, pick mode) is unchanged.

## Consequences

An execution session is the first documented way anything in this codebase can make the engine
actually write to the application under test. That capability is deliberately narrow: it requires
the caller to explicitly opt in per session, it never widens the allowlist, and every request it
lets through is still registered as evidence exactly like a GET (ADR-005) — there is no execution
mode where a mutation happens without a hash-timestamped record of it. The cost is that a project
whose `qa-execute` skill or an operator mistakenly opens an execution-mode session against
exploration work would lose the GET-only guarantee for that session; this is accepted because the
option is explicit and named for what it does, not a global config flag that could be left on by
accident.
