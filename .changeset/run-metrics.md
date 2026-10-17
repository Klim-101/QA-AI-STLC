---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
'@qa-ai-stlc/cli': minor
---

`qa.run_metrics` (and `qa metrics [--run <run-id>]`) says how a run of the agent layer was carried out, read from the spoke I/O store and the `agents` budgets only: tasks, attempts and valid, error and unanswered responses per spoke, retries used against `agents.retries`, wall-clock and busy time, the time overlapping attempts saved, attempts that timed out, and the most attempts running at once against `agents.parallelism`. It has no token count or cost: the engine reads no host transcript.
