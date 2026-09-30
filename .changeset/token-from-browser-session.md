---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

A `from-browser` auth profile reads its token where an operator would find it in developer tools: a cookie, a `localStorage` or `sessionStorage` key (with an optional JSON path) or the observed `Authorization`-style request header, from an open `qa.browser_open` session (`sessionId`) or, for cookies and `localStorage` only, from an identity's saved storage state (`identity`). Only allowlisted origins are read, a session of another environment is refused, the token is read on every call and never returned to the agent or stored in evidence.
