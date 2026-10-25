---
'@qa-ai-stlc/explorer': patch
---

Exploration no longer registers a form control (a select, a textarea or a text input) with a `getByText` locator. Such a locator matched a heading or label carrying the same word and still passed the uniqueness check, so a spec that sorted a catalog failed on a heading instead of the dropdown. A select or textarea is also no longer named by its option text or value.
