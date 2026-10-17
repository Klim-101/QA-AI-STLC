---
'@qa-ai-stlc/explorer': patch
---

`qa explore --expand-collapsed` no longer ends on the sign-in page behind an application whose session token is used once. Each page is read in a context of its own, and every context started from the state the sign-in produced, so an application that hands out the next token on use accepted it for the first page and sent every later one to the sign-in page, which was then read as if it were the page asked for. A context now starts from the state the previous one ended with. A page that still ends on the identity's sign-in page stops the exploration with `EXPLORE_SIGNED_OUT`, naming the page, before anything is written.
