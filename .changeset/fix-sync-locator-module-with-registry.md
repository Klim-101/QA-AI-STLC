---
'@qa-ai-stlc/explorer': patch
'@qa-ai-stlc/mcp-server': patch
---

Export an element promoted during an interactive session from `tests/qa/locators.ts` without a new crawl: `qa.registry_execute_register` now regenerates the locator module and reports the element's `locator` (the export name, or why it is skipped), and `qa.generation_spoke_input` brings the module in line with the registry before reading it. `qa-execute` and `qa-generate-tests` guidance updated.
