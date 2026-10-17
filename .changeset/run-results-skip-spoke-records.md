---
'@qa-ai-stlc/core': patch
---

Listing run results no longer picks up the spoke records a run holds under `runs/<run-id>/spokes/`. Since the spoke I/O store, `qa report`, `qa validate --run`, `qa.rca_input`, `qa.triage_input` and `qa.triage_add` failed on any project in which the hub had recorded a dispatch, because the records were read as results.
