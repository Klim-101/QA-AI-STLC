---
'@qa-ai-stlc/core': patch
---

An accessibility scan result must now be a complete axe-core result: `{}`, `null`, an array, a result without its four result lists, its `testEngine` or the options it ran with is rejected with `A11Y_SCAN_RESULT_INVALID` instead of counting as a clean scan, and a result scanned under other rule tags than the configured WCAG target is rejected with `A11Y_SCAN_CONFIG_MISMATCH`. This covers both the `a11y` runner and `qa.browser_a11y_scan`.
