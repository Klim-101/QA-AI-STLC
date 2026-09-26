---
name: qa-generate-tests
description: >-
  Use when the operator explicitly asks for a deterministic Playwright/API spec to be generated or
  regenerated for an approved test case ("generate the test for the checkout case", "turn this
  qa-execute session into real code", "regenerate the login spec, the case changed"). Never use to
  design a case (`qa-design-cases`), to execute a case live (`qa-execute`), or to run an
  already-generated spec (`qa run`, no skill needed). Does not fire on its own to warn that a spec
  is stale — that is a future `qa-regression`/hub concern, not this skill's.
triggers:
  - 'generate the test for the checkout case'
  - 'turn this qa-execute session into a real spec'
  - 'regenerate the login test, the case steps changed'
nonTriggers:
  - 'design a test case for password reset'
  - 'execute the checkout case live'
  - 'run the regression suite'
  - 'is the generated spec for this case still up to date'
references:
  - ../../references/testing-standards.md
  - references/generation-standards.md
---

# `qa-generate-tests` — spec generation from a proven session

Fires only on an explicit request to generate or regenerate a spec. Never runs proactively to
detect or announce a stale spec — that stays the hub's/a future `qa-regression`'s job.

## Before generating anything

1. **Require a completed `qa-execute` session.** Call `qa.generation_proven_session` with the
   case's id. `found: false` means there is no proven session yet, or one exists but predates the
   `stepId` convention (`references/web.md`/`references/api.md`) — either way, refuse and say so
   plainly. Never fall back to authoring from the case's free-text description alone.
2. **Read the proven steps from `found: true`'s `session`.** Its `steps` are already grouped by
   `stepId` in case order, each with the recorded action(s) that proved it — never re-derive steps
   from conversation or memory.
3. **Check for an existing spec.** If `spec.filePath` already has content, extract its manual
   regions (`extractManualRegions`) before generating the new template, so hand-edited code survives
   (`// qa:manual:start <id>` / `// qa:manual:end <id>`).
4. **Resolve the registry slice.** `buildGenerationSpokeInput` needs the exact element ids the
   proven session actually used — fail loudly on one that does not resolve, never guess a locator.
   Pass the proven session itself as `buildGenerationSpokeInput`'s `provenSession` option, so it
   becomes part of `sourceHash` and a later `qa-execute` re-run is detected as drift.

## Writing the spec

Follow [`references/generation-standards.md`](references/generation-standards.md) for the
generation-specific rules (traceability, independence, anti-flaky locators) and
[`../../references/testing-standards.md`](../../references/testing-standards.md) for the shared
ISTQB/ISO 29119 grounding. Two points worth restating:

- **One `test.step([id] ...)` with an explicit assertion per case step.** This is what lets the
  existing verification loop catch incomplete coverage — a spec missing one is rejected, not
  registered.
- **Registry locators only.** Never write a raw, ad hoc selector into generated content.

## Verifying and registering

1. `applyManualRegions` to splice preserved hand-written code back into the freshly generated
   template.
2. `verifyGeneratedTestSpec` — typechecks the candidate, then executes it once through the runner.
3. Only a `'verified'` outcome is registered, via `registerVerifiedGeneratedTestSpec`.
4. A `'typecheck_failed'` or `'execution_failed'` outcome is never registered. Report the `issues`
   plainly; the hub re-dispatches within the configured retry budget
   (`hasVerificationRetryBudget`) — this skill does not run its own retry loop.

## What this skill does not do

- It does not design or edit case content — that is `qa-design-cases`.
- It does not execute a case live — that is `qa-execute`, and must run first.
- It does not report a "test generated" outcome without a `'verified'` result.
- It does not proactively scan for or announce stale specs.
- It does not hand-edit code outside a manual-region marker.
