---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

A failed run now produces defect drafts through the triage spoke. `qa.defect_draft_input` lists, for each failure the run's registered triage called a product bug, the parts of a draft the engine knows (the case's steps and expected result, its requirements, the failure message as `actualResult`, where the run happened and the evidence the triage cited). A defect draft can name the failure it came from (`source: { runId, resultId }`), and the engine then holds it to the triage: that failure must be a product bug there (`DEFECT_SOURCE_NOT_TRIAGED`), and the draft must cite at least one piece of evidence (`DEFECT_EVIDENCE_MISSING`) and only evidence the triage cited for it (`DEFECT_EVIDENCE_NOT_OF_RESULT`). A flaky, stale-selector, environment or uncertain failure cannot be filed as a defect this way. The triage spoke's contract and subagent now draft the defects after registering the triage; accepting a draft stays the operator's step.
