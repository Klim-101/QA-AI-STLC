---
'@qa-ai-stlc/core': minor
---

Add the generation verification loop (P3-06, development plan section 5.2): a generated spec
(P3-05's `GeneratedTestSpec`) is never registered on trust. `verifyGeneratedTestSpec` typechecks it
against a real `tsc` invocation and, only if that passes, executes it once through the injected
`Runner`; either failure returns `SpokeValidationIssue[]` naming exactly what to fix (a typecheck
diagnostic's file/line/column, or an execution failure's `RunResult.failure`/`missingStepIds`).
`registerVerifiedGeneratedTestSpec` writes the spec to its real path and the manifest, and only
accepts a `'verified'` outcome. `hasVerificationRetryBudget` reads the existing
`config.agents.retries` field. New `FileSystem.deleteFile()` port method, and a new pinned
`typescript` runtime dependency for the `tsc` spawn.
