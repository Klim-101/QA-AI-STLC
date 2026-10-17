---
'@qa-ai-stlc/core': patch
---

A store lock is no longer taken over while its holder is still writing it. A claim creates the lock file and then writes the time into it; a waiter that read it in between saw it empty, took that for an ancient lock and deleted it, so two parallel spokes could hold the lock together and lose each other's writes.
