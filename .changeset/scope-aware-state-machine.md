---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
---

Scope-aware state machine (P2-16, development plan section 2.7): the pipeline now enforces the
testing-scope survey end to end instead of only at `qa init`.

- `qa scope` and `qa cases add` now reject with a coded error while any testing type (`e2e`,
  `api`, `a11y`, `security`) is still `undecided` — previously only `qa init` checked this, and a
  project that later reset a type to `undecided` (or deferred the survey with `--defer-scope`)
  could scope and register cases anyway.
- `qa cases add` also rejects a case whose own `testType` is not `in-scope`, so a case for an
  out-of-scope or undecided type is never silently registered.
- Approving the `cases` gate now requires "one case set per in-scope type": every `in-scope` type
  needs at least one registered case, and no case may exist for a type that is not `in-scope`.
- A later `qa config set testing.<type>` that changes a decided type reopens the `cases` gate the
  next time `qa approve`/`qa validate` runs, the same recompute-not-cache treatment `GateStateMachine`
  already gives an edited artifact's content hash (ADR-003) — `Approval` records an optional
  `testingScope` snapshot for this.
- `qa validate`'s report gains `caseSetStatusByType`, one status (`satisfied`/`missing`/
  `not-applicable`) per case-bearing type, so an out-of-scope type's empty case set is reported as
  `not-applicable` rather than silently absent.
