---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
'@qa-ai-stlc/cli': patch
---

The `qa-metrics` skill answers questions about how a run of the agent layer was carried out ("how did the agent run go", "how many retries did we use", "did we stay within the parallelism budget") by relaying `qa.run_metrics`, and says that tokens and cost are not measured instead of estimating them. `qa.run_metrics` now also returns `markdown`, the same figures rendered by the engine (seconds converted and formatted once), which the skill relays as it is; `qa metrics` prints that rendering.
