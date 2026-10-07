---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Add the defect-acceptance gate. `qa defect add --path <path>` (MCP `qa.defect_add`) registers a tracker-neutral defect draft under `artifacts/defects/<id>.json`, checking its requirement links against the scope and that every evidence path was registered by the engine. `qa defect accept <id> --approved-by <name>` (MCP `qa.defect_accept`) accepts it with an approval bound to the hash of the exact accepted content: a draft that claims `accepted` without an approval, or is edited afterwards, reads as `draft`.
