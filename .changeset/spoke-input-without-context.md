---
'@qa-ai-stlc/schemas': patch
---

`SpokeInputRecordSchema` accepts a record without `context`. The engine stores a dispatch made without context with the key omitted, and reading it back failed validation.
