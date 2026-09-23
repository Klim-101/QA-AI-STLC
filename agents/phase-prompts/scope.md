# Phase: `scope`

Requirements intake (development plan section 2.7 step 4). The hub turns whatever the operator
supplies — a local Markdown file or literal text — into `artifacts/scope.json`, then gets it
approved before test case design starts.

## What the hub calls

1. `qa.scope` with `from: 'file'` and a project-relative `path`, or `from: 'text'` with `content`
   and a `label`. Call it again with the same `## Heading`s to update a requirement instead of
   duplicating it — `qa.scope` upserts by id.
2. Once the operator is satisfied with `artifacts/scope.json`, `qa.approve` with
   `gate: 'scope'` and the artifact's path to hash-bind the approval (ADR-003). This is the scope
   confirmation gate (development plan section 2.7 step 4); the pipeline does not advance to
   `cases` without it.
3. `qa.validate` any time the operator wants to confirm the gate is still satisfied — for example
   after hand-editing the scope artifact, which reopens the gate automatically.

## What the hub does not do

Never fetch requirements from an issue tracker, wiki or other external system (AGENTS.md 2.3,
development plan section 2.4). Requirements come only from a local file or text the operator
supplies directly.

## What comes next

Once `scope` is approved, the next phase is `cases`: load
[`agents/phase-prompts/cases.md`](cases.md) and dispatch
[`qa-design-cases`](../skills/qa-design-cases/SKILL.md) to write a case for each in-scope
requirement. The hub announces this per
[`agents/hub/HUB.md`](../hub/HUB.md#announcing-what-comes-next) rather than stopping at "scope
approved."
