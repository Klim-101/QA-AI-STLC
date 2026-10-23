---
'@qa-ai-stlc/core': patch
---

Let an api case that expects an error status be registered as `passed` when the `http-status` is declared in `resultExpectations`: a request that returned exactly that status now proves the step that made it. `qa-execute` no longer says such a case cannot be `passed`.
