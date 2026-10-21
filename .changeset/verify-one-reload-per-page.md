---
'@qa-ai-stlc/explorer': patch
---

`qa explore --verify` reloads a page and resizes its viewport once per page instead of once per stored element, as building the registry already did. A page with many elements no longer takes a reload for each of them to verify.
