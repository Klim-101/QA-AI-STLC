---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/explorer': patch
'@qa-ai-stlc/cli': patch
---

Spokes dispatched in parallel on Claude Code no longer lose each other's writes. The store has `withLock`, a lock under `.qa/locks/` that waits for the holder and takes over one left by a process that died (`STORE_LOCK_TIMEOUT` after 30 seconds). The manifest, the case indexes, the selector registry and a run's spoke records are written under it, so parallel registrations, case designs, explorations and dispatches (`SPOKE_PARALLELISM_EXCEEDED` is now exact under concurrency) all survive. Files are saved whole through a temporary file and a rename, so a reader never sees half of one. `persistExploreResult` reads the registry it merges into inside the lock, and no longer takes it as an argument. The hub definition says when it may dispatch spokes in parallel.
