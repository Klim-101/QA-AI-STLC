---
'@qa-ai-stlc/explorer': patch
---

Fix `qa explore --verify` navigating with no safe-mode route handler installed at all, unlike
every other operation that drives a browser, and unconditionally reporting `blockedRequestCount: 0`
in its report regardless of what actually happened. `--verify` now installs the same route handler
`qa explore`'s registry build uses and reports the real count of non-GET requests it blocked.
