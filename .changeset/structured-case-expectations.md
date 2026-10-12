---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
---

A test case can declare structured expectations: `expectations` on a step and `resultExpectations` for the final result (visible, hidden, text, value, count, checked, url, http-status, http-body-contains, a11y-clean). The engine derives from the cited evidence whether each is met, and `qa.case_result_register` refuses `passed` with `RUN_RESULT_EXPECTATION_UNMET` while any is unmet or never checked (ADR-0016). An api case that expects an error status can now be `passed`. Existing cases are unchanged. The readable Markdown copy of a case lists the declared checks.
