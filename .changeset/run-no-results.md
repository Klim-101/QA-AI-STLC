---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/cli': patch
---

`qa run` / `qa.run` now fails with a coded `RUN_NO_RESULTS` error when a spec set produces zero
results — a `--spec` path that does not exist or matches no tests previously wrote an empty
`RunRecord` and exited `0`, a silent false green since nothing was actually verified. Distinct from
a run that produced results with a `skipped`/`passed` status, which is unaffected.
