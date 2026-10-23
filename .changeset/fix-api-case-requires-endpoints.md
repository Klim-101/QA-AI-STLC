---
'@qa-ai-stlc/core': patch
---

Refuse an `api` case without `endpoints` when it is added (`CASE_API_ENDPOINTS_REQUIRED`), instead of failing later at spec generation and reopening the cases gate. `qa-design-cases` now says to fill `endpoints` from the contract.
