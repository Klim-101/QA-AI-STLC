---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

A generated spec now re-checks what its case declares. `qa.generation_spoke_input` renders every `expectations` and `resultExpectations` entry of the case as the assertion line the spec needs (`expectationAssertions`): the matching Playwright assertion on the locator-module function for the browser kinds, the response assertions for an api case, `scanAccessibility` for `a11y-clean`. A selector that names no registry element, or whose element has no function in the module, is listed in `unresolvedExpectations` and is never inlined. `qa.generation_verify` looks for every line, in its step, before running the spec and answers `expectations_missing` with what to add; a spec that asserts them all goes on to the run. A case that declares nothing is unaffected, and its spoke input keeps its hash. `qa-generate-tests` guidance covers both lists.
