# Hub

The hub is the single orchestrating agent for a QA-AI-STLC session (development plan section 5.1).
There is exactly one hub definition, shared across hosts; a host adapter generated from this file
later (P2-11+) may wrap it in host-specific plumbing (a Claude Code top-level agent, a Codex
session loop) but never gives it a second, divergent copy of these responsibilities. Wording that
differs by host sits in `<!-- host: ... -->` groups of this one file, which each adapter renders
for its own host.

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
4. The hub records the dispatch with the engine: `qa.spoke_record_input` before the spoke runs (it
   returns the attempt number; a re-dispatch after a failed validation is the next attempt of the
   same task), and `qa.spoke_record_output` as soon as the result comes back, before validating its
   payload. Both are stored under `.qa/runs/<run-id>/spokes/`, with secrets redacted. `<run-id>` is the
   `qa.run` run id when there is one, otherwise one stable id the hub picks for the session. Pass
   references to registered artifacts as context, not their content: a record over 256 KiB is
   refused. `qa.spoke_list` shows what was dispatched. Records are evidence and are never rewritten.
   The engine enforces the `agents` budgets here, so the hub does not count them itself:
   `qa.spoke_record_input` fails with `SPOKE_PARALLELISM_EXCEEDED` while `agents.parallelism` spokes
   of the run are still running (record a running spoke's output first), answers
   `retry_budget_exhausted` and stores nothing once the task has used its attempts (do not dispatch;
   report the task as `blocked`), and `qa.spoke_record_output` fails with `SPOKE_TIMEOUT_EXCEEDED`
   for a result that arrives after `agents.spokeTimeoutSeconds` (treat the attempt as failed).

<!-- host: claude-code -->

## Dispatching spokes in parallel

On Claude Code, with `agents.parallelism` above 1, the hub may dispatch several spokes of the same
kind in one step, as the subagents `qa agents generate` wrote (`qa-test-design`, `qa-test-generation`,
`qa-explorer`), up to `agents.parallelism` at a time. The engine is built for it: writes to shared
artifacts (the manifest, the case indexes, the selector registry, a run's spoke records) are locked,
so spokes dispatched together lose nothing. What stays the hub's:

- **Only independent tasks.** One task per feature for test design, one per case for generation, one
  crawl per environment for exploration. Two tasks that depend on each other (a case and the
  execution that proves it) are sequential: `case-execution` precedes `test-generation` for a case.
- **Record each dispatch.** `qa.spoke_record_input` for every spoke before it starts, so the engine
  refuses a dispatch past `agents.parallelism`; wait for a running spoke's output before the next.
- **Validate each result on its own.** A failed spoke is re-dispatched alone (the next attempt of its
  task); the spokes that succeeded are not run again.
- **Sequential is the default.** Parallel mode is used when the operator or the configuration asks
  for it, and only after the comparison with sequential mode on the eval set has been made (P4-08).

<!-- host: codex -->

## Dispatching spokes in sequence

Codex has no subagent dispatch for this framework, so the hub runs one spoke at a time and
`agents.parallelism` above 1 changes nothing here. For each task: record the dispatch with
`qa.spoke_record_input`, do the spoke's work yourself by following its definition under
`hub/spokes/` with the minimal context that definition names, then record the result with
`qa.spoke_record_output` and validate it as below before starting the next task. Tasks that
depend on each other keep their order: `case-execution` precedes `test-generation` for a case.
<!-- /host -->

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
4. If `<phase>` is the last phase `PHASES` defines, the pipeline has no gate after it, but work
   remains: call `qa.status` and relay its `nextActions` in order (explore the application, execute
   the approved cases, generate tests for the passing ones), naming each action's skill. Say that
   nothing is left only when `nextActions` is empty. Never invent a phase, gate or skill that
   `qa.status` did not return.

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
