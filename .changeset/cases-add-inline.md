---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.cases_add` takes the test case inline as `testCase`, so `qa-design-cases` no longer writes temporary case files into the project tree. `path` still works for an existing file; giving both, or neither, fails with `CASES_ADD_USAGE`.
