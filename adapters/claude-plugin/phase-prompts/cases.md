# Phase: `cases`

Test case design (development plan section 2.7 step 5). The hub registers test cases that link
back to the requirements approved in the `scope` phase, then gets the case set approved.

## What the hub calls

1. `qa.cases_add` with a project-relative `path` to a test case written as JSON
   (`TestCaseSchema`). The tool rejects a case whose `requirementIds` do not resolve against
   `artifacts/scope.json` with `CASE_UNLINKED_REQUIREMENT` — resolve the requirement id in the
   `scope` phase first, it is never invented here.
2. Once the operator is satisfied with the registered case set, `qa.approve` with `gate: 'cases'`
   and `artifactPath: 'artifacts/cases-index.json'` — the case-set aggregate `qa.cases_add`
   regenerates after every registration, never a single case's own file (#357: approving one case's
   file left every other case unapproved and undetected). This is the case review gate (development
   plan section 2.7 step 5); execution and generation do not start without it.
3. `qa.validate` to re-check every registered case's requirement links against the current scope
   artifact — useful after a requirement in `artifacts/scope.json` changes, since that can silently
   break a case written against it.

## What the hub does not do

Never write case content that is not a case the operator or a design spoke actually produced
(ADR-001: the engine authors no test content itself). The hub's job in this phase is dispatching
design work and registering + gating its output, not inventing cases.

## What comes next

`cases` is the last phase `packages/core/src/phases.ts`'s `PHASES` currently defines — execution
and generation (development plan section 2.7 step 6 onward) are Phase 3+ and not built yet. Once
`cases` is approved, the hub says exactly that per
[`agents/hub/HUB.md`](../hub/HUB.md#announcing-what-comes-next): there is nothing implemented
after this phase yet, not a fabricated "run the tests now." Update this section when a phase after
`cases` actually ships.
