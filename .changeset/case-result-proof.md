---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.case_result_register` accepts `passed` only when the cited evidence proves it: every step has successful evidence linked to its `stepId`, and the expected result has a successful check of the case's type (e2e: a passing `qa.browser_expect`; api: a response below 400; a11y: a scan with no violations and nothing uncertain). Otherwise it fails with `RUN_RESULT_STEP_NOT_PROVEN` or `RUN_RESULT_EXPECTED_RESULT_UNCHECKED`. A run can hold results for one case only (`RUN_RESULT_RUN_BOUND_TO_OTHER_CASE`). `qa.browser_accessibility_scan` takes a `stepId`.
