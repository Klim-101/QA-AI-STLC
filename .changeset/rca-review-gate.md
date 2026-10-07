---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Add the root cause analysis artifact and its review gate. `qa rca add --path <path>` (MCP `qa.rca_add`) registers an RCA under `artifacts/rca/<defect-id>.json` only for an accepted defect (`RCA_DEFECT_NOT_ACCEPTED` otherwise) and stamps the defect's hash on it (`defectSha256`, new optional field on `RcaSchema`); `qa rca approve <defect-id> --approved-by <name>` (MCP `qa.rca_approve`) records a review approval bound to the RCA's exact content. An approved RCA reads back as `draft` once the defect it explains changes. The RCA renders to Markdown with facts kept apart from hypotheses.
