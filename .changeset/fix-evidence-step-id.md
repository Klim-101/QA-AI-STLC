---
'@qa-ai-stlc/schemas': patch
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/mcp-server': patch
---

Refuse an evidence `stepId` that is not `step-<N>` when a browser or HTTP tool is called, and leave such ids out when a case's proven session is read back, instead of failing the whole session. `qa-execute` now says to link the expected-result checks to the case's last step.
