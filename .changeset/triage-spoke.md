---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
'@qa-ai-stlc/cli': minor
---

The triage spoke: `qa.triage_input` gives it every failed result of a run with the failure message, a `failureKind` hint read off it (network, locator-not-found, assertion-mismatch, other), the registered evidence, the case's history across runs and whether the configured flaky thresholds call it flaky. `qa.triage_add` (also `qa triage add --path`) registers its classification under `artifacts/triage/<run-id>.json`: product bug, flaky, stale selector, environment or uncertain, each with a confidence and reasons. The engine refuses a failure left out, one classified twice, evidence that is not the result's, and `flaky` for a case whose history is not flaky. `triage` joins the spoke definitions, so it gets a contract and a generated subagent (`agents.models.triage`).
