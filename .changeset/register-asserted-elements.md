---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.browser_expect` reports a note, `EXPECTATION_SELECTOR_NOT_REGISTERED`, when a case step asserts on a selector that names no registry element, so the agent registers it before recording a result a spec cannot be generated from. `qa-execute`, `qa-design-cases` and `qa-explore` say to assert on registered, role/name-based elements and never on run data.
