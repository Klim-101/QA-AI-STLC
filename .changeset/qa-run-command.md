---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Add `qa run` / MCP `qa.run` (P3-04): runs a spec set through the `Runner` for its test type (only
`e2e`, via `@qa-ai-stlc/runner-playwright`, has one so far) and persists every `RunResult` plus a
new `RunRecordSchema` summary under `.qa/runs/<run-id>/results/` and `.qa/runs/<run-id>/run.json`.
This is a new, per-invocation layout distinct from `qa.case_result_register`'s per-case one
(`.qa/runs/<test-case-id>/`, P3-14): a run can cover many results from one spec set, a case-result
registration covers exactly one ad hoc interactive check. `--environment <name>` resolves the
`baseUrl` from `config.yaml`, the same domain-allowlist-aware resolution every other environment-
aware command already uses.
