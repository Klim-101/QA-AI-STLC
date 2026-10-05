---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
---

Fix `qa.browser_set_date` and the generated date helper on a Kendo UI for Angular segmented date input: a component-library profile can now declare `dateEntry: 'digits'`, and the date is entered by typing its digits one key at a time instead of filling the formatted string, which the mask rewrote into a different date.
