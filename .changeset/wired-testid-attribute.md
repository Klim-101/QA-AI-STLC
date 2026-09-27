---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/runner-playwright': patch
---

Fixed `config.yaml`'s `selectors.testIdAttribute` being silently ignored: the crawler, pick mode
and static source analysis all hardcoded `data-testid` regardless of what was configured, so an
application using a different stable test attribute (e.g. `data-ui-id`) got no test-id locator
signal at all. The configured attribute is now read consistently by exploration, and by Playwright
itself (`getByTestId()`) during both live stability scoring and generated test execution.
