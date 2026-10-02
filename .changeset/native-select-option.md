---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.browser_select_option` also picks an option of a native by its visible text and checks the select shows it afterwards; a multi-select keeps what it already had chosen. An option the select does not have is `BROWSER_WIDGET_OPTION_NOT_FOUND`, and the error names the options it does have.
