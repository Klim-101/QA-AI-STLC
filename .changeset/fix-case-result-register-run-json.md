---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/mcp-server': patch
---

`qa.case_result_register` no longer fails with `JSON_FILE_INVALID` once a `qa run` has been recorded. The check that a run is not reused for another case now reads only run results, not the `run.json` summaries and spoke records that also live under `.qa/runs/`.
