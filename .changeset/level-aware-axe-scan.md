---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.browser_accessibility_scan` now runs axe-core against the configured `a11y` target: the WCAG version and cumulative level pick the rule tags (AAA rules are enabled explicitly, as axe-core disables them by default), best-practice rules are opt-in, and include/exclude selectors narrow the scan. `incomplete` results are reported as `uncertain`, violations covered by an unexpired exception are reported as `excepted` instead of dropped, and the evidence records the axe-core version and a hash of the effective `a11y` config.
