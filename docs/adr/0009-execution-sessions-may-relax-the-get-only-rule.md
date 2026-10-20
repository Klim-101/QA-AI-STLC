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

`qa.browser_open` and `qa.browser_attach` take an optional `caseId`. When it is set, the session's safe-mode route handler allows non-GET requests through instead of aborting them. The domain allowlist check is unaffected either way: an execution session can still only reach the environment's configured allowlist.

The engine, not the caller, decides whether the relaxation is allowed. Before any browser starts it checks that every gate is satisfied and that the approved case set (ADR-003) lists the case's file under the hash it has now. Otherwise it refuses with `EXECUTION_CASE_NOT_APPROVED`. The operator's approval of the `cases` gate is therefore what lets a session write to the application, the same way only the operator widens the allowlist (ADR-0014, ADR-0019). Without a `caseId` nothing changes for exploration and pick mode.

An earlier version took an `executionMode` boolean, which an agent could set for any session. It was replaced because nothing tied it to an approved case.

## Consequences

An execution session is the first way anything in this codebase makes the engine write to the application under test. It never widens the allowlist, it needs an approved case, and every request it lets through is registered as evidence like a GET (ADR-005). Editing the case afterwards, or adding another case, reopens the gate and ends the permission until the operator approves again.
