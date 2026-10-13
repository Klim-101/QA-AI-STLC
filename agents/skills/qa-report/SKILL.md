---
name: qa-report
description: >-
  Use when the operator asks about run status, a run summary, or requirement/case/result
  traceability ("what's the status of the last run", "show me the traceability matrix", "did the
  login case pass", "how many tests failed", "what's still not covered"). Never use to run tests
  (`qa run`), generate specs (`qa-generate-tests`) or design cases (`qa-design-cases`). Does not
  fire proactively after a run, generation or execution finishes on its own — only on an explicit
  status/report request.
triggers:
  - "what's the status of the last run"
  - 'show me the traceability matrix'
  - 'how many tests passed in the last run'
nonTriggers:
  - 'run the login spec'
  - 'design a test case for password reset'
  - 'generate the test for the checkout case'
---

# `qa-report` — run status and traceability narration

Fires on an explicit request for run status, a run summary, or the requirement → case → result →
evidence traceability matrix. Never runs proactively after some other skill finishes — that stays
the hub's/operator's call, not this skill's.

## What this skill does

1. Call `qa.report` with whatever `runId` the operator's request implies a specific run, or omit
   it for the most recently started `qa run` plus every case result live execution registered.
   Leave `format` unset (Markdown default) unless the operator explicitly asked for HTML —
   Markdown is what this skill reads back.
2. Narrate what came back, by origin: `runSummary` is a `qa run` of a spec set, `interactiveSummary`
   holds the results `qa-execute` registered (one row per case, its latest result), and
   `traceabilityMatrix` covers both. Either summary can be absent; say which one the report had.
   Every count, status and requirement/case link reported here must be one already present in the
   tool's own rendered text. Never recompute, round, average or estimate a figure instead of reading
   it — the report is engine-rendered from canonical JSON (AGENTS.md 12.5), not something this skill
   re-derives. Keep `blocked`, `uncertain`, `partial` and `skipped` apart from `passed` and `failed`.
3. If `qa.report` fails with `REPORT_NO_RUNS`, say so plainly: nothing has been run and no case
   result was registered yet, so suggest `qa run` or executing a case with `qa-execute` — do not
   guess a status for a run that was never recorded. Any other `QaError` is relayed with its own
   message and `remediation`, not swallowed or reworded.

## What this skill does not do

- It does not run tests, generate specs, design cases or approve gates — it only reads and
  narrates an already-rendered report.
- It does not fire on its own the moment a run, generation or execution completes; the operator
  (or hub, per its own "announcing what comes next" convention) asks for a report explicitly.
- It does not fabricate a number, trend or interpretation absent from `runSummary`/
  `interactiveSummary`/`traceabilityMatrix`'s own rendered text.
