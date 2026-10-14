---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.case_result_register` now accepts `missingStepIds`, so an execution that finished some steps of a case can be registered as `partial` instead of falling back to `uncertain`. The field is required for `partial` and refused for every other status, and each id must be a step of the registered case (`step-<N>` or `expected-result`); otherwise the call fails with `RUN_RESULT_MISSING_STEPS_REQUIRED`, `RUN_RESULT_MISSING_STEP_UNKNOWN` or `RUN_RESULT_MISSING_STEPS_NOT_PARTIAL`. The `qa-execute` guidance says when to use `partial`.
