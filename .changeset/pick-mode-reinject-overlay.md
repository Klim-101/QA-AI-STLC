---
'@qa-ai-stlc/explorer': patch
'@qa-ai-stlc/cli': patch
---

`qa explore --pick` brings the pick-mode toolbar back after a login redirect or any other navigation, and reports a closed window as `explorer.pick_mode.page_closed` instead of a raw Playwright error.
