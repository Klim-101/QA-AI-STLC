---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/runner-playwright': minor
---

Add evidence capture during runs (P3-03, ADR-004/ADR-005). `runner-playwright` now enables
Playwright's own screenshot-on-failure and trace-on-failure capture and reads back whatever it
attached to a failed or retried test; the `Runner` interface's `run()` returns a `RunnerOutcome`
per result (the `RunResult` paired with that raw, unregistered evidence) instead of a bare
`RunResult[]`, so a runner still never writes to the evidence store itself. `runTestRun` (`qa run`
/ MCP `qa.run`) registers each item through `EvidenceStore` — hashed, scanned for leaked secrets
and, for `network-har`, redacted, same as every other evidence path (AGENTS.md 12.5) — and fills in
the matching `RunResult.evidenceIds`. A `failed` result with no evidence registered after that
(every item was quarantined, or the runner captured none) now throws `RUN_RESULT_MISSING_EVIDENCE`
instead of silently persisting an unbacked failure.
