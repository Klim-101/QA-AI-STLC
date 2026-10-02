---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

The browser action tools (`qa.browser_click`, `qa.browser_fill`, `qa.browser_select_option`, `qa.browser_set_date`, the popup tools and the grid tools) accept `ref` from the session's latest `qa.browser_snapshot` in place of `selector`; exactly one of the two is required (`BROWSER_TARGET_INVALID` otherwise). The engine resolves a ref to a role and exact-name selector, records that selector and the ref's role and name in the action evidence, and acts on the selector. A ref from an earlier snapshot, a ref used after a navigation or once the page URL changed, and a ref whose role and name no longer match exactly one element all fail with `BROWSER_REF_STALE`. Refs are numbered across the whole session, so one from an older snapshot is never mistaken for a new element. Action evidence gains an optional `ref` field.
