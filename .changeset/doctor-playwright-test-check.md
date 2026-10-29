---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
'@qa-ai-stlc/cli': minor
---

`qa doctor` / `qa.doctor` now checks that `@playwright/test` resolves from the project root when `testing.e2e`, `testing.api` or `testing.a11y` is `in-scope`. A bare project failed the first generated spec's typecheck even though the doctor was green, because the doctor only looked at the engine's own Chromium. The failing check is named `playwright-test` and its remediation gives the install command (`npm install --save-dev --save-exact @qa-ai-stlc/cli`). On Codex, `qa-start` shows the operator that command to run in their own terminal instead of retrying with a local npm cache.
