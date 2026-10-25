---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/runner-playwright': patch
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/mcp-server': patch
---

`qa run` (and MCP `qa.run`) can bound parallelism and the per-test timeout with `--workers <n>` and `--timeout-ms <ms>` (`workers`, `testTimeoutMs`). Without them Playwright's defaults still apply, so a large spec set against a slow application no longer has to fail with 30-second timeouts that disappear in smaller batches.
