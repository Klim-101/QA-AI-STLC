---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa report` and `qa.report` now report the results `qa-execute` registered, not only `qa run` records. A session that executed cases but never ran a spec set no longer ends in `REPORT_NO_RUNS`: the new `interactiveSummary` lists one row per case (its latest result, with an honest status) and the traceability matrix already covered both. `runId`, `runRecordPath` and `runSummary` are now present only when a `qa run` record is reported, and `--run <id>` also accepts the id of a live execution run. `REPORT_NO_RUNS` now means neither kind of result exists.
