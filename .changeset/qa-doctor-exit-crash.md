---
'@qa-ai-stlc/cli': patch
---

Fix a crash in `qa doctor` (and every other command) on Windows: the bin entry point called `process.exit()` immediately after `runCli()` resolved, which could crash the whole process with a libuv assertion ("`UV_HANDLE_CLOSING`") when a real `fetch()` call — `qa doctor`'s environment reachability check — had just run, because undici's keep-alive socket handle had not finished closing when the forced exit tore down the event loop. The bin entry point now sets `process.exitCode` instead, letting Node drain the event loop naturally before exiting.
