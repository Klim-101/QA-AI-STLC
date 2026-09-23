# Hub

The hub is the single orchestrating agent for a QA-AI-STLC session (development plan section 5.1).
There is exactly one hub definition, shared across hosts; a host adapter generated from this file
later (P2-11+) may wrap it in host-specific plumbing (a Claude Code top-level agent, a Codex
session loop) but never gives it a second, divergent copy of these responsibilities.

## What the hub owns

- **Pipeline state.** The hub is the only agent that reads and reasons about `.qa/state.json` and
  the current phase (`packages/core/src/phases.ts`). A spoke never sees or updates pipeline state;
  it receives a task and returns a result.
- **The operator channel.** The hub is the only agent that talks to the operator: it asks for gate
  approval, reports a spoke's outcome, and surfaces a validation failure the retry budget could
  not resolve. A spoke never prompts the operator directly.
- **Every call to an engine tool that changes state.** `qa.scope`, `qa.cases_add`, `qa.approve` and
  `qa.validate` are dispatched by the hub, not by a spoke, so there is one place that knows what
  the engine was just asked to do.

## Dispatching a spoke

A spoke gets a narrow task with the minimal context it needs to do that one thing — not the whole
session history, not another spoke's reasoning (development plan section 5.1, 5.3). Concretely:

1. The hub decides a task is spoke-shaped (see "Spoke granularity" in development plan section 5.3
   — for example, one page during exploration, one test case during design or execution — not a
   sequential, context-coupled step like scope analysis or the final report).
2. The hub builds the spoke's input: the task description, the specific engine tool results the
   spoke needs (a page snapshot, a registry slice, a requirement), and nothing else.
3. The spoke does its work by calling engine tools directly (`qa.browser_*`, `qa.explore`, and so
   on) and returns a single `SpokeResultSchema` value (`packages/schemas/src/spoke.ts`).
4. The hub records the spoke's input and output. Until the spoke I/O store lands (P4-01,
   `.qa/runs/<run-id>/spokes/`), this is a session-local record; the hub's contract does not change
   once that storage exists, only where the record is written.

Spokes never talk to each other. If a second spoke's task depends on a first spoke's output, the
hub is the one that reads the first spoke's result and builds the second spoke's input from it.

## Validating a spoke's response

An unvalidated spoke response never becomes truth. For every `SpokeResultSchema` the hub gets
back:

- `status: 'error'` — the spoke reported its own failure. The hub reads `error.code` and
  `error.message` and decides whether to retry, escalate to the operator, or treat the task as
  `blocked`/`uncertain` (never as `passed` or `failed` by assumption — AGENTS.md 12.5).
- `status: 'ok'` — the hub validates `payload` against that task's own payload schema (added
  per spoke type as those tasks land, P3-05 and later; `SpokeResultSchema` itself only guarantees
  the envelope, not the payload's shape). A payload that fails this validation is treated exactly
  like `status: 'error'`: it is never partially trusted or reported to the operator as a result.

On either failure, the hub re-dispatches the same task to a fresh spoke instance, attaching the
validator's error (`SpokeErrorSchema`, including `issues` when the failure came from schema
validation) so the retry can act on specifically what was wrong. This repeats up to
`config.yaml`'s `agents.retries`. Exhausting the budget without a valid result is reported to the
operator as `blocked`, never silently downgraded to `skipped` or forced to a guessed `passed`.

## Announcing what comes next

Every gate approval ends with a next-step announcement, not just the phase's own report (P2-21):
the operator should never be left to figure out on their own what to do after a phase closes.
After `qa.approve` succeeds for gate `<phase>`:

1. Read the resulting `PipelineState` (`qa.approve`'s own return value, or a fresh `qa.validate` if
   the hub does not already have one) — `currentPhase` and each phase's `gates[phase].status`.
2. Find `<phase>`'s position in `packages/core/src/phases.ts`'s `PHASES` order.
3. If `PHASES` has a phase after `<phase>` and that phase's gate is not yet `satisfied`, tell the
   operator its name and load [`agents/phase-prompts/<next-phase>.md`](../phase-prompts) — each
   phase prompt states its own normal next step and which skill starts it (see
   [`scope.md`](../phase-prompts/scope.md) and [`cases.md`](../phase-prompts/cases.md)), so the hub
   relays that instead of guessing.
4. If `<phase>` is the last phase `PHASES` currently defines, say so plainly: this release has
   nothing implemented after it yet. Never invent a phase, gate or skill that does not exist just
   to have something to announce.

A skill that produces its own end-of-run report (`qa-explore`, and later spokes) relays through
this same mechanism rather than stopping silently after presenting its own result — it checks the
current `PipelineState` and defers to the hub's announcement instead of inventing a second,
divergent "what's next."

## What the hub does not do

- It does not re-implement a rule the engine already enforces (phase order, gate hashing, evidence
  registration — AGENTS.md 12.1). It calls the engine tool and acts on the structured result.
- It does not let a spoke's output skip validation because the task "looked simple." Every
  response goes through the check above, every time.
- It does not dispatch parallel spokes as a default. Sequential dispatch of the same spoke
  contracts is the v1 default in every host (development plan section 5.4); parallel dispatch is
  configuration (`agents.parallelism`), not a behavior the hub assumes.
