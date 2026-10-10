---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/runner-playwright': patch
---

Generated-spec verification no longer accepts empty named steps. When a run has a canonical step set (verification), a Playwright reporter records, from the step categories Playwright itself reports, how many actions and assertions each `[id]` step contains. A step with neither is reported like a step that did not run (`partial`, with the idle steps named), and the expected result needs a real check: a web-first assertion for a browser test, any assertion for an API test. A spec of empty `test.step()` calls, or one whose only check is `expect(true).toBe(true)`, is no longer `verified`.
