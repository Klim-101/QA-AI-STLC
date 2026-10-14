---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
---

`qa.generation_spoke_input` lists the locator functions the module really exports. Since elements with an identical locator share one function, the list built from registry names named functions that do not exist, and a spec importing one failed typecheck. The generated `tests/qa/locators.ts` now says above each function which elements it answers (`// elements: <id> <id>`), and the spoke input reads that. A module written by an older generator is refused with `GENERATION_LOCATOR_MODULE_OUTDATED`; re-run `qa explore` to regenerate it.
