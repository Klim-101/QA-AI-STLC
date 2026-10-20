---
'@qa-ai-stlc/explorer': patch
---

`qa explore --expand-collapsed` hands the next page the browser state its page had when it finished loading, before any panel was opened. Before, it handed over the state after the clicks, so something a click stored in the browser reached the following pages.
