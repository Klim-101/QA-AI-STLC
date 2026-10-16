---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa report --output [path]` and the `output` input of `qa.report` save a Markdown run-result report to the project. It is rendered from the engine's own data: a case table with status, finish time, evidence count and result id, the failure reasons, the `qa run` executions of generated specs, the accessibility conformance counts, the defects with the status their approval supports and the approved root cause analyses. A section with nothing to show is omitted, `blocked`, `skipped`, `uncertain` and `partial` keep their own names, and evidence is counted, never inlined. The default path is `artifacts/reports/run-result-<date>.md`; the result returns the path written. The `qa-report` skill points the operator to the saved file.
