---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Every registered test case now has a readable Markdown copy with its preconditions, steps and expected result at `artifacts/cases-md/<feature>/<id>.md`, written when the case is added or linked and registered in the manifest. `qa cases add` and `qa.cases_add` return its path as `markdownPath`, and the feature index Markdown links to each copy, so cases can be reviewed before approving the `cases` gate without reading JSON.
