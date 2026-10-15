---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

A spoke I/O store: the hub records what it gave each spoke and what came back under `.qa/runs/<run-id>/spokes/<spoke>/<task>/attempt-<n>/` with three new tools. `qa.spoke_record_input` stores the task and minimal context and returns the attempt number the engine assigned (a re-dispatch is the next attempt, nothing is overwritten); `qa.spoke_record_output` stores the result exactly as received, before the hub validates its payload, and refuses an output whose attempt has no recorded input; `qa.spoke_list` lists the attempts of a run with the status of each output. Secrets are redacted before anything is written, names must be single safe path segments, and a record over 256 KiB is refused. The hub definition describes the calls.
