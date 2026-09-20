---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/cli': patch
---

Fix `qa explore --pick` launching its browser headless, so the window a human is supposed to click
elements in never actually appeared and the command hung until pick mode's 30-minute timeout.
`BrowserLauncher.launch()` now takes an optional `{ headless }`; pick mode passes `headless: false`,
every other caller (crawling, scripted login) is unaffected and still launches headless.
