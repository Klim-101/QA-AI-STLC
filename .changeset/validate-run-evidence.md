---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Add `qa validate --run` / MCP `qa.validate` with `checkRuns: true` (P3-09): an opt-in sweep of
every recorded `RunResult` — from `qa run` or from interactive case execution alike — for a
fabricated evidence link (an `evidenceIds` entry with no matching registered evidence file,
excluding a quarantined item's own receipt) and for a `failed` result with no registered evidence
at all. Independent of `runTestRun`'s own write-time `RUN_RESULT_MISSING_EVIDENCE` check, this
catches the same gap in results written through any path, including `qa.case_result_register`,
which accepts a caller-supplied `evidenceIds` with no such check. Also fixes a real bug found
while building this: `buildTraceabilityMatrix` (P3-08) only scanned `qa run`'s own
`runs/<run-id>/results/` layout, silently missing every result interactive case execution wrote
under its own flat `runs/<test-case-id>/` layout — both now share a new `listRunResultPaths`
helper.
