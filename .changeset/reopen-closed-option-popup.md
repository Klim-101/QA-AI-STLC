---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
---

`qa.browser_select_option` no longer fails when the list closes itself between finding an option and clicking it. The first click is bounded to five seconds; if it cannot land, the popup is reopened and the click repeated once with the full action timeout, and that second failure is the one reported. The option helpers in a generated locator module do the same.
