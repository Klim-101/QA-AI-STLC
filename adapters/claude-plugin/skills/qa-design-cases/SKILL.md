---
name: qa-design-cases
description: >-
  Use when the operator wants test cases written or updated ("design test cases for the checkout
  flow", "write cases for this requirement", "add a regression case for X"). Never use to start a
  session (`qa-start`), build the registry (`qa-explore`), or execute an already-written case.
triggers:
  - 'design test cases for the checkout flow'
  - 'write a test case for the login requirement'
  - 'add a critical-path case for password reset'
nonTriggers:
  - 'start a QA session for this project'
  - 'explore the app and build the selector registry'
  - 'run the checkout test case'
---

# `qa-design-cases` — test case design

Fires when the operator wants one or more `TestCaseSchema` cases written. Follows
[`agents/references/testing-standards.md`](../../references/testing-standards.md) for structure
(preconditions, steps, expected result, `regressionTier`, `feature`, `testDataRefs`) rather than
restating it here — read that file before writing a case's content.

## Before writing anything

1. **Feature.** Check `artifacts/cases/` and `artifacts/test-data/` for an existing feature folder
   before asking the operator to name a new one — reuse it rather than coining a near-duplicate.
2. **Requirements.** Read `artifacts/scope.json` and pick `requirementIds` from what is already
   registered there. `qa.cases_add` rejects a case whose id does not resolve — run `qa.scope` first
   if the requirement genuinely does not exist yet, never invent an id to satisfy the check.
3. **Testing scope.** Check `config.yaml`'s `testing` block for the case's `testType`
   (`e2e`/`api`/`a11y`). `qa-start` normally already confirmed this at session start; re-check here
   if this skill fires mid-session. Never write a case for an `out-of-scope` or `undecided` type.
4. **Real elements, not invented ones.** For an `e2e` case, ground steps in what
   `.qa/selectors/registry.json` (read directly — no MCP query tool for it) actually contains
   rather than a plausible-sounding locator that may not exist on the page. The registry holds
   every environment of the project: read only the elements whose `environment` is the one the case
   is for, or that name none (found in the source, or stored before the field existed).

## Writing the case

Follow `testing-standards.md`'s field guidance. Three points worth restating because they are easy
to skip under time pressure:

- **English only, regardless of conversation language.** Every field's content — title,
  preconditions, steps, expected result — is written in English even when the operator writes to
  you in another language.
- **`regressionTier` is not optional in practice.** Pick one of the four tiers deliberately — do
  not leave it unset because the right tier is unclear; ask the operator instead.
- **Declare what the engine can check.** Next to the free-text `expectedResult`, write the checks the
  engine can compare itself: `expectations` on the step that observes something, and
  `resultExpectations` for the final outcome. Kinds: `visible`, `hidden`, `text`, `value`, `count`,
  `checked` (with a `selector`) and `url` for `e2e`/`a11y`; `http-status` and `http-body-contains`
  for `api`; `a11y-clean` for `a11y`. Use selectors the registry holds and exact expected values;
  an `api` case that expects an error status declares it with `http-status`. Without them the
  engine only checks that some successful check exists, and `passed` rests on the executor's
  judgement of the text
  ([ADR-0016](../../../docs/adr/0016-structured-case-expectations-judged-by-the-engine.md)).
- **An `api` case needs `endpoints`.** Fill it with the `{ method, path }` of each operation the case
  calls, taken from the API contract (`qa-api`). `qa.cases_add` refuses an `api` case without it
  (`CASE_API_ENDPOINTS_REQUIRED`), and adding it after approval would reopen the cases gate.
- **`testDataRefs` before inlining.** If a value repeats across steps or cases (a test card number,
  a seeded username), write it once as a `TestDataSchema` set (`qa.test_data_add`) and reference it
  by id, instead of copying the literal value into every case. `qa-explore-data`
  ([P6-19](https://github.com/Klim-101/QA-AI-STLC/issues/265), not built yet) will later discover
  these values from the live app and its API surface; until then, values are written by whoever is
  designing the case — real, working values, not placeholders — and this skill should be revisited
  once P6-19 lands to hand that step off to it.

## What this skill calls

- `qa.cases_add` to register each case, after it passes the checks above. Pass the case as the
  `testCase` input; never write it to a file in the project first (a crash would leave the file in
  the repository under test). `path` is only for a case file the operator already has. Each call returns
  `markdownPath`, a readable copy of the case with its steps and expected result: when the cases are
  ready for review, list those paths for the operator so they can read the cases without opening JSON
  before the hub asks for gate approval.

## What this skill does not do

- It does not call `qa.approve` for the `cases` gate — that stays the hub's job
  ([`agents/phase-prompts/cases.md`](../../phase-prompts/cases.md)), not duplicated here.
- It does not invent a requirement id, a feature name or a locator to make registration succeed;
  a missing prerequisite is surfaced to the operator, not worked around.
- It does not execute the case or drive `browser.*`/HTTP/axe-core tools — that is a later pipeline
  step, [`qa-execute`](../qa-execute/SKILL.md).
