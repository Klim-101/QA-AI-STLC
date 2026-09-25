---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Add `qa report` / MCP `qa.report` (P3-08, ADR-002): renders a run summary and the requirement →
case → result → evidence traceability matrix as Markdown or HTML, from the canonical JSON already
recorded under `.qa/` — no hand-written report path exists. `buildTraceabilityMatrix`
(`@qa-ai-stlc/core`) joins every requirement in `scope.json` against every case that links to it
and each case's most recent run result across every run ever recorded, not just the one being
reported on. Defaults to the most recently started run and Markdown format;
`--run <run-id>`/`runId` and `--format markdown|html`/`format` select otherwise. Two new artifact
kinds (`run-summary`, `traceability-matrix`) join the existing Markdown renderer registry, and a
new HTML renderer registry mirrors it — the framework's first HTML output.
