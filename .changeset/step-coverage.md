---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/runner-playwright': minor
---

Add step/expected-result coverage tracking (P3-02). `RunResultSchema` gains an optional
`missingStepIds` field, required and non-empty exactly when `status` is `'partial'`. A Playwright
spec opts a test into coverage tracking with a `stepIds` annotation (`{ type: 'stepIds',
description: '<comma-separated ids>' }`) and titles each `test.step()` call `[<id>] <description>`;
`playwrightRunner` parses the real JSON report's step titles and, when a `passed` or `failed` test
did not reach every declared step, reports it as `partial` with the missing IDs instead of claiming
a verdict the run never fully reached. A test with no `stepIds` annotation is unaffected.
