---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
---

Fix `qa.browser_select_option` and the generated widget helpers on a Kendo UI for Angular multiselect: wait for a popup's animation before clicking an option and before deciding it needs closing (a pressed Escape dropped the choice just made), and open the multiselect through its input instead of its middle, where a chip sits.
