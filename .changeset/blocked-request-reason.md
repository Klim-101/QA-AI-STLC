---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/mcp-server': patch
---

`qa explore` and `qa.browser_close` now say why safe mode blocked a request. The summary used to count every blocked request as `non-GET`, so a plain `GET` to an API on another port (an allowlisted host on a different port) was reported as a mutation and the hint pointed at `safeNonGetRequests`, which cannot help. Each blocked request now carries a reason: `method` (not a `GET`), or `host`, `scheme` or `port` (it left the environment's allowlist or `baseUrl`). `qa explore` prints a line per reason and a separate list with a hint that fits it: only a blocked method points at `safeNonGetRequests`; a blocked origin points at the allowlist and `baseUrl`. `qa.explore` returns `blockedRequestCounts` (complete, unlike the capped listing) and a `reason` on each blocked entry; `qa.browser_close` returns a `reason` on each blocked request and `blockedCounts`. A request off the allowlist is reported by its origin whatever its method. Pick mode now sums the complete counts instead of the capped listing. The `qa-explore` skill reads the reason before advising.
