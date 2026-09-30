---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Add `qa api-diff` (MCP `qa.api_diff`): compares the OpenAPI 3.x contract named by `api.source` (a project file, an allowlisted URL, or `discover`, which probes the well-known spec paths with GET requests only) with the endpoints the last `qa explore` observed, and writes `selectors/api-diff.json` with each discrepancy classified as matched, undocumented, method not documented or unobserved, stamped with the contract's SHA-256. Path parameter names are ignored when comparing, so `/tasks/{taskId}` matches the observed `/tasks/{id}`.
