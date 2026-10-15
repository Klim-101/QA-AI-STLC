---
'@qa-ai-stlc/schemas': patch
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.defect_add` and `qa.rca_add` take the defect draft (`draft`) and the root cause analysis (`rca`) inline, validated by their schemas, so an agent writes no scratch file in the operator's project; `path` still works, and exactly one of the two is given. A content that does not match fails with `DEFECT_INVALID` or `RCA_INVALID` whose remediation lists every invalid field by its path with the values it allows, and a file that does not match (`JSON_FILE_INVALID`) now carries the same list instead of a bare message. The fields of both schemas have descriptions in the tool's input schema. The `qa-rca` skill registers inline.
