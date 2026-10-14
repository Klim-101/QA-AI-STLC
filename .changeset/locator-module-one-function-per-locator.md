---
'@qa-ai-stlc/explorer': minor
---

The generated locator module (`tests/qa/locators.ts`) is easier to use against a large application. Elements that share a locator (the rows of a repeated list) now have one function instead of numbered copies, and the generator reports which elements share it. Elements added during an interactive session (`execute` strategy) become `page.locator(...)` functions, named after their selector when they have no name, instead of being dropped. Every active registry element is now either an export, shared with one, or reported as skipped with a reason (`no-locator-candidate`, `no-name`). A data grid gets `<name>Row(page, rowText)` and `<name>Cell(page, rowText, columnName)` helpers. Names ignore a number or a letter plus digits (`V11102`) in favour of the next meaningful signal, and an element that is found again keeps the name it had, so specs that import it keep working.
