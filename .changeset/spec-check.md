---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
'@qa-ai-stlc/cli': minor
---

`qa.spec_check` (and `qa spec check --spec <path>`) runs a spec set through its runner and says what each test did (status, a capped failure message between untrusted-data markers, missing steps) without recording anything: no run record, result file, evidence or manifest entry, so it changes neither `qa report` nor the history that flaky detection and triage read. The reviewer subagent is now told to check a spec with it instead of `qa.run`, so a review no longer adds a run.
