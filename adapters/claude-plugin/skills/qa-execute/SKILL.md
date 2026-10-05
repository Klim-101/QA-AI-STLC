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
# Tool-selection evals (P6-62): each case gives the model a step and asserts it reaches for `expect`
# and never for the tools in `never`. Generated into `adapters/claude-plugin/evals-tools/`; see agents/README.md.
toolChoices:
  - id: attach-signed-in
    prompt: >-
      The application signs in through the company single sign-on with a one-time code, so the engine
      cannot log in itself. The operator has signed in in their own Chrome, started with
      --remote-debugging-port=9222. Continue the case in that signed-in browser, then stop.
    expect: qa.browser_attach
    never: [qa.browser_open]
  - id: select-not-click
    prompt: >-
      Browser session session-1 is open on the case edit form and you have its snapshot. Case step 3:
      set the Priority drop-down to "High". Perform that step with the engine browser tools, then stop.
    expect: qa.browser_select_option
    never: [qa.browser_click]
  - id: check-not-click
    prompt: >-
      Browser session session-1 is open on the case edit form and you have its snapshot. Case step 4:
      tick the "Notify me" checkbox and make sure it ends up ticked. Perform that step, then stop.
    expect: qa.browser_check
    never: [qa.browser_click]
  - id: expect-not-narrate
    prompt: >-
      Browser session session-1 is open and you just clicked Save. The case's expected result for step 5
      is that the text "Saved" is visible. Verify that expected result with the engine tools, then stop.
    expect: qa.browser_expect
  - id: wait-then-check
    prompt: >-
      Browser session session-1 is open. You clicked Save and the list reloads about two seconds later.
      Wait until the text "Order 17" appears on the page, then stop.
    expect: qa.browser_wait_for
    never: [qa.browser_click]
  - id: upload-not-fill
    prompt: >-
      Browser session session-1 is open and you have its snapshot. Case step 2: attach the project file
      fixtures/avatar.png to the avatar upload input (ref e5). Perform that step, then stop.
    expect: qa.browser_upload
    never: [qa.browser_fill]
  - id: press-not-click
    prompt: >-
      Browser session session-1 is open with a menu showing. Case step 6: press the Escape key to close
      the menu. Perform that step, then stop.
    expect: qa.browser_press
    never: [qa.browser_click]
  - id: switch-tab
    prompt: >-
      Browser session session-1 is open. Clicking "Terms" opened a new tab. Continue the case in that
      new tab: make it the page you act on, then stop.
    expect: qa.browser_tabs
  - id: console-for-diagnosis
    prompt: >-
      Browser session session-1 is open. Case step 7 clicked Save and nothing visible happened. Find out
      whether the application logged an error to the browser console, then stop.
    expect: qa.browser_console
  - id: snapshot-diff
    prompt: >-
      Browser session session-1 is open. Snapshot evidence-5 was taken before you clicked "Terms" and a
      dialog opened. Read only what changed on the page since that snapshot, then stop.
    expect: qa.browser_snapshot
    inputMatch: '"since"\s*:\s*"evidence-5"'
references:
  - ../../references/testing-standards.md
  - ../../references/component-libraries.md
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
  locator, and promoting ad hoc finds with `qa.registry_execute_register`. For drop-downs, date
  pickers and data grids (a Kendo project, or any custom widget) also read
  [`component-libraries.md`](../../references/component-libraries.md).
- **`api`** — see [`references/api.md`](references/api.md): `qa.http_execute` directly, no browser.
- **`a11y`** — see [`references/accessibility.md`](references/accessibility.md):
  `qa.browser_accessibility_scan` against an open session's current page.

Every one of these tools registers its own evidence before returning — collect each call's
evidence id as you go.

## Recording the result

Call `qa.case_result_register` once the case's steps are done, with every evidence id collected
along the way. You decide `status` yourself, after reading back the evidence and comparing it
against the case's `expectedResult`. The engine never decides the case's status (ADR-005): the
`passed` of each `qa.browser_expect` is its reading of the page for one expectation, evidence you
weigh, not the case result. `status: 'failed'` requires a `failure.message` naming what actually
went wrong; never report `failed` without one, and never report `passed` when the evidence does not
actually support it.

## What this skill does not do

- It does not write or edit case content — that is `qa-design-cases`. A case that turns out to be
  wrong (a stale selector, an outdated step) is reported back for redesign, not patched in place
  here.
- It does not turn a proven session into a deterministic Playwright or API spec — that is
  [`qa-generate-tests`](../qa-generate-tests/SKILL.md), which reads this session's own proven steps
  back from evidence rather than this skill handing them over directly.
- It does not replay an already-generated spec (`qa run`, a deterministic, no-model operation with
  no skill of its own).
- It does not approve or reopen the `cases` gate — that stays the hub's job
  ([`agents/phase-prompts/cases.md`](../../phase-prompts/cases.md)).

## What comes next

Once this skill registers a passing run result, `qa-generate-tests` can turn it into a
deterministic spec — but only if every step-performing call above carried its `stepId` (see
`references/web.md`/`references/api.md`); a session that skipped this has no proven steps to
generate from.
