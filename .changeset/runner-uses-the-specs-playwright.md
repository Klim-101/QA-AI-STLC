---
'@qa-ai-stlc/runner-playwright': patch
'@qa-ai-stlc/core': patch
---

The Playwright runner now runs a spec set with the `@playwright/test` the specs themselves resolve, and falls back to its bundled copy only when none is reachable. When the engine ran from an `npx` cache and the project had its own Playwright, the spec registered its tests with a copy nobody was running, Playwright found zero tests, and `qa.generation_verify` ended in `core.verification.unexpected_outcome_count` (and `qa run` in `RUN_NO_RESULTS`). A spec that fails to load now ends in `RUNNER_NO_TESTS_RAN` with Playwright's own message, and the verification error names the spec, the project root and the environment.
