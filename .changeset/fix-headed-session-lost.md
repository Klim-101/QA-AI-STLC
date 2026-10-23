---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/mcp-server': patch
---

Say what happened when a browser session's browser goes away. A browser that exits right after `qa.browser_open` launched it now fails with `BROWSER_EXITED_DURING_OPEN` and a remediation, instead of a raw "Target page, context or browser has been closed". A session whose window is closed later (by the operator or a crash) is reported as `BROWSER_SESSION_LOST` on its next call, instead of as an unknown id. `qa-execute` tells the agent to say so and ask before carrying on headless.
