---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
---

Flags a test case as flaky when its run history flips status within a configurable window
(`flaky.historyWindow` / `flaky.minStatusChanges` in `config.yaml`). The traceability matrix
(`qa report`) now shows a `Flaky` column per case, computed from every recorded run under
`.qa/runs`, not a fixed pass-rate formula — a case that always fails is never flagged flaky.
