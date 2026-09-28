---
'@qa-ai-stlc/core': patch
---

Generated-spec verification no longer fails in a project whose working directory contains a `tsconfig.json`. TypeScript 6 refuses to typecheck explicit files in that case (TS5112), so every spec was reported as `typecheck_failed`. Verification now passes `--ignoreConfig` and keeps typechecking against its fixed baseline.
