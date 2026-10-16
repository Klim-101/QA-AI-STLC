---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

The engine enforces the `agents` budgets of `.qa/config.yaml` on spoke dispatch. `qa.spoke_record_input` fails with `SPOKE_PARALLELISM_EXCEEDED` while `agents.parallelism` spokes of the run are still running (an attempt past `agents.spokeTimeoutSeconds` no longer holds a slot), and answers `status: retry_budget_exhausted` with a `SPOKE_RETRY_BUDGET_EXCEEDED` `budgetError`, storing nothing, once a task has used its first attempt plus `agents.retries` re-dispatches. `qa.spoke_record_output` fails with `SPOKE_TIMEOUT_EXCEEDED` for a result that arrives after `agents.spokeTimeoutSeconds`. The result of `qa.spoke_record_input` gains `status`, and `inputPath` is absent when nothing was stored. Both tools now need the project configuration.
