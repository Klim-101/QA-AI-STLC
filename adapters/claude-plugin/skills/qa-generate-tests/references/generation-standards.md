# Generation standards reference

Background specific to `qa-generate-tests`: how a proven `qa-execute` session's steps become a
deterministic Playwright/API spec, aligned with ISO/IEC/IEEE 29119-3 (test scripts) and the ISTQB
syllabus. [`../../references/testing-standards.md`](../../references/testing-standards.md) covers
case design and defect-report structure; this file covers the translation from a proven session into
code and does not restate that material.

This is background knowledge for the skill's own reasoning, not a set of rules the engine
enforces separately — where a rule below is checkable, the engine already checks it (AGENTS.md
12.1). The traceability rule below in particular is enforced today by existing code, not by this
skill's own judgment; see the note under that heading.

## Traceability (ISO 29119-3: test case to test script)

Every `TestCaseStep` the proven session covered must produce exactly one `test.step([id] ...)`
call in the generated spec, carrying an explicit assertion on that step's expected result. `[id]`
is the step's own id from the case, matching the `stepIds` annotation convention `runner-playwright`
already parses (`packages/core` test-run coverage, development plan section 2.7).

This is not merely encouraged: `packages/core/src/verification.ts`'s `executionIssues()` already
turns a `partial` run result (a step that did not run or complete, per `RunResult.missingStepIds`)
into `'execution_failed'`, never `'verified'` — a spec missing a step's `test.step()`/assertion is
rejected by the existing verification loop, not registered. Generating the annotation correctly is
what makes that existing mechanism actually catch this failure mode for a generated spec; it is not
new engine logic this skill needs to invent.

## Test independence (ISTQB: no test depends on state another test left behind)

Each generated spec gets its own `test.describe` block and starts from a fresh browser
context/session or a fresh HTTP client, never assuming state a different generated spec's run left
behind. This is documentation, not a runtime check — Playwright's own per-test isolation already
guarantees a fresh context by default, so nothing in `verification.ts` re-checks it; a spec that
deliberately shares mutable state across tests (a module-level variable, a shared page object
holding session state) is a review-time judgment call for whoever generates or reads the spec, not
a mechanism the engine gates on.

## Anti-flaky generation

- **Registry locators only.** Every locator in generated content resolves through the locator
  module `buildGenerationSpokeInput` already assembled from the selector registry
  (`registrySlice`/`locatorModule`, P3-04) — never a raw, ad hoc selector string written directly
  into the spec, even when one would work. A locator the registry does not have is a signal to run
  `qa-execute` again (which promotes ad hoc finds into the registry with `source: 'execute'`) or
  `qa-explore`, not something to hardcode around.
- **No arbitrary waits.** A generated step waits on the same Playwright auto-waiting and explicit
  assertions (`expect(...).toBeVisible()` and similar) the runner already provides — never a fixed
  `page.waitForTimeout()` to paper over timing uncertainty.
- **One expected result, one assertion.** Mirrors `testing-standards.md`'s case-design guidance
  ("a case that needs several independent expected results is usually several cases") at the code
  level: a `test.step()` asserts the one outcome its case step names, not several unrelated
  conditions bundled together.

## What this file is not

It does not define the shared case-design/defect-report structure — that is
`testing-standards.md`. It does not define `qa-generate-tests`'s trigger wording or tool-call
sequence — that is the skill's own `SKILL.md`.
