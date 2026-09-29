---
name: qa-start
description: >-
  Use when the operator wants to start, resume, or check the status of a QA-AI-STLC session ("start
  testing this app", "let's begin QA", "where did we leave off", "what's the current phase").
  Also use when no `.qa/` project exists yet and the operator wants one set up. Never use once a
  session is already running and the operator names a concrete exploration or case-design task —
  dispatch that directly to `qa-explore` or `qa-design-cases` instead of re-entering this skill.
triggers:
  - 'start a QA session for this project'
  - "let's begin testing the checkout app"
  - 'where did we leave off with QA'
  - 'what phase are we in'
  - 'set up QA-AI-STLC for this repo'
  - 'initialize QA for this new project'
nonTriggers:
  - 'explore the app and build the selector registry'
  - 'write test cases for the login flow'
  - 'why did this test case fail'
---

# `qa-start` — hub entry point

Fires when the operator wants to begin or resume a session. This skill is the thin trigger surface
a host matches on; it does not restate the hub's dispatch or validation contract — that is
[`agents/hub/HUB.md`](../../hub/HUB.md). Once loaded, act as the hub for the rest of the session.

## Cold start / resume sequence

Run these in order, every time. Stop and report to the operator at the first failing step rather
than continuing past it.

1. **Confirm the project root.** Look for `.qa/` from the current working directory upward and
   state the resolved path back to the operator explicitly � never assume it silently. The MCP
   tools resolve the root the same way, so they act on this directory. If none is found, say so and
   run [First-time setup](#first-time-setup) below instead of stopping.
2. **Check the environment.** Call `qa.doctor`. If `ok` is `false`, show every `fail` check with its
   `remediation` and stop — do not proceed to a phase against an environment the engine itself
   reports as broken.
3. **Check the testing scope.** Read `.qa/config.yaml`'s `testing` block. For any type still
   `undecided`, ask the operator to resolve it as `in-scope` or `out-of-scope` (never leave it
   `undecided` and continue — the engine blocks `qa scope` and later phases on an undecided type,
   P2-16). Resolve it with `qa.config_set` (`key: testing.<type>`, `value`) using the operator's
   answer, never one you chose yourself. An explicit `out-of-scope` answer is a real
   decision — that type is recorded `not-applicable` and takes no further part in the session, it is
   not silently skipped.
4. **Resume or start.** Read `.qa/state.json`. If it does not exist, the session starts at the first
   phase (`scope`). If it exists, read `currentPhase` and continue from there. Either way, hand off
   to the matching [`agents/phase-prompts/<phase>.md`](../../phase-prompts) for what to actually
   call next — this skill's job ends at knowing which phase prompt to load, not doing that phase's
   work itself. If every phase's gate in `.qa/state.json` is already `satisfied`, do not stop with
   just that status: relay what comes next the same way a gate approval would (P2-21) — the
   `currentPhase`'s own phase prompt states it (see
   [`agents/hub/HUB.md`](../../hub/HUB.md#announcing-what-comes-next)).

## First-time setup

Runs only when step 1 found no `.qa/`. The operator never needs a terminal.

1. Call `qa.init` with any placeholder answers and **no** `confirmedRoot` to get the `projectRoot` it
   would use (nothing is written). If it refuses because `.qa/` already exists in a parent
   directory, relay its message and stop: that is another project.
2. State `projectRoot` to the operator and ask them to confirm it. If it is wrong, stop and tell
   them to restart the session from the right directory.
3. Ask each question through the host's question UI, one at a time: Web E2E, API, accessibility and
   security testing, each `in-scope`, `out-of-scope` or `undecided` (defer). Then ask for the
   optional source path of the application under test and, when API is `in-scope`, the API contract
   source (a file, a URL, `discover` or `synthesize`).
4. Call `qa.init` again with the literal answers and `confirmedRoot` set to `projectRoot`.
5. Offer to add an environment (`qa.config_add`, `kind: environment`: name, base URL, allowlist) and
   an identity (`kind: identity`). For an identity ask only for the `QA_*` variable **name** and tell
   the operator to set its value in their own shell; never ask for, accept or repeat a password or
   token.
6. Continue with step 2 of the sequence (`qa.doctor`).

## What this skill does not do

- It does not re-implement gate approval, phase ordering or evidence rules � those are state-machine
  behavior the engine enforces (AGENTS.md 12.1); this skill only reads their current state.
- It does not perform exploration or case-design work itself. Once the phase is known, dispatch to
  the skill or phase prompt that owns that work.
- It never answers a scope question on the operator's behalf, and it never writes `.qa/` by hand:
  every write goes through `qa.init`, `qa.config_set` or `qa.config_add`.
