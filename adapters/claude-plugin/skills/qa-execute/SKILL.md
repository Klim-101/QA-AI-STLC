---
name: qa-execute
description: >-
  Use when the operator wants an already-registered test case actually run live to prove it works
  ("execute the login case", "run this case for real and see what happens", "prove the checkout
  case actually passes", "verify this case before we generate a test"). Never use to write a new
  case (`qa-design-cases`), to turn a proven session into a deterministic spec
  (`qa-generate-tests`), to replay an already-generated spec (`qa run`, no skill needed), or to
  read run results (`qa-report`).
triggers:
  - 'execute the login test case for real'
  - 'run the checkout case live and see if it actually works'
  - 'prove this case passes before we generate code for it'
nonTriggers:
  - 'write a test case for password reset'
  - 'generate the Playwright test for this case'
  - 'run the full regression suite'
  - 'what is the status of the last run'
references:
  - ../../references/testing-standards.md
  - references/web.md
  - references/api.md
  - references/accessibility.md
---

# `qa-execute` — interactive case execution

Fires when the operator wants a registered case proven to actually work, live, before any code is
generated for it (development plan section 2.7 step 6). Not a research or exploration session —
the case already exists (`qa-design-cases`); this skill drives it.

## Before executing anything

1. **Find the case.** Read it from `artifacts/cases/<feature>/<id>.json` — never re-derive its
   steps from memory or conversation. If the operator names a case loosely ("the login case"),
   confirm which registered case they mean before starting.
2. **Confirm the test type.** The case's own `testType` (`e2e`, `api` or `a11y`) decides which
   reference file below applies; do not assume from the case's title.
3. **No content invention.** This skill executes a case's existing `steps`; it does not add,
   reorder or skip a step to make execution easier. A step that cannot be performed as written
   (an element genuinely does not exist, an endpoint returns something unexpected) is a finding to
   report, not something to work around silently.

## What this skill calls, by test type

- **`e2e`** — see [`references/web.md`](references/web.md): `qa.browser_open` with
  `executionMode: true`, reading the normalized page snapshot to find targets without a static
  locator, and promoting ad hoc finds with `qa.registry_execute_register`.
- **`api`** — see [`references/api.md`](references/api.md): `qa.http_execute` directly, no browser.
- **`a11y`** — see [`references/accessibility.md`](references/accessibility.md):
  `qa.browser_accessibility_scan` against an open session's current page.

Every one of these tools registers its own evidence before returning — collect each call's
evidence id as you go.

## Recording the result

Call `qa.case_result_register` once the case's steps are done, with every evidence id collected
along the way. You decide `status` yourself, after reading back the evidence and comparing it
against the case's `expectedResult` — the engine never computes a verdict (ADR-005's "the engine
records, it does not fabricate a verdict" principle, applied here the same way it already applies
to every `qa.browser_*` tool). `status: 'failed'` requires a `failure.message` naming what actually
went wrong; never report `failed` without one, and never report `passed` when the evidence does not
actually support it.

## What this skill does not do

- It does not write or edit case content — that is `qa-design-cases`. A case that turns out to be
  wrong (a stale selector, an outdated step) is reported back for redesign, not patched in place
  here.
- It does not turn a proven session into a deterministic Playwright or API spec —
  `qa-generate-tests` ([P3-07](https://github.com/Klim-101/QA-AI-STLC/issues/54), not built yet)
  does that from this session's own proven steps.
- It does not replay an already-generated spec (`qa run`, a deterministic, no-model operation with
  no skill of its own).
- It does not approve or reopen the `cases` gate — that stays the hub's job
  ([`agents/phase-prompts/cases.md`](../../phase-prompts/cases.md)).

## What comes next

`qa-generate-tests` is not built yet (P3-07): once this skill registers a passing run result, say
so plainly and note that generating a deterministic spec from it is planned but not available —
never fabricate a "test generated" outcome. Update this section once P3-07 ships.
