---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/mcp-server': patch
---

`qa.browser_expect` with an empty `expected` for `text` or `url` used to pass on every element, because any text contains the empty string; it now means the text is empty and is compared in full, so it fails on an element that has text. `value` with an empty `expected` already checked that an input holds nothing. A generated spec renders an empty `text` expectation as `toHaveText("")` instead of the vacuous `toContainText("")`. The tool description and the `qa-execute` guidance now say that a `count` of 0 only proves that nothing matched, and to pair it with a `visible` check on the container.
