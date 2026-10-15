---
'@qa-ai-stlc/explorer': patch
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/mcp-server': patch
---

An element an agent added from a live session (`qa.registry_execute_register`) is no longer deprecated by the next `qa explore`. The crawl cannot see such elements (a collapsed panel, a header or chip that is not natively interactive), so missing one says nothing about it being gone; it used to be marked deprecated and then left out of `tests/qa/locators.ts`, so a spec could not import it. A crawl that misses a session-added element also no longer counts it as removed, and `qa explore --verify` now resolves the `execute` strategy instead of failing with `locator-strategy-unknown`. An element that is not found on a fresh page load (revealed only after an interaction) is reported as degraded.
