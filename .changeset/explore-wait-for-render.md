---
'@qa-ai-stlc/explorer': patch
---

Make `qa explore` wait for a page to finish rendering (content present, no busy indicator, DOM quiet) before reading it, so single-page applications that render after the load event no longer produce an empty registry. A page that never settles is read as it is and reported with the `EXPLORE_PAGE_NOT_SETTLED` warning.
