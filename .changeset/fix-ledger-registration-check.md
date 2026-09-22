---
'@qa-ai-stlc/core': patch
---

Fix `ApprovalLedgerStore.load()` trusting a hand-written `artifacts/approval-ledger.json` on a
project with no prior approvals: `append()` registers the ledger in the manifest (#278), but a
project where `append()` had never run had no manifest entry to compare against, so `load()`
returned whatever the file on disk said with no check at all. A forged ledger paired with a
matching hand-written artifact satisfied a gate and advanced `currentPhase` with nothing detecting
it — `qa validate` reported `tamperedArtifacts: []`.

`load()` now checks the manifest before trusting the ledger's content: an unregistered ledger is
treated the same as no approvals yet, so a forged gate can no longer report `satisfied`.
`qa validate` also now lists the ledger path in `tamperedArtifacts` whenever it exists on disk but
was never registered, so the forgery stays visible instead of silently reading as "nothing
approved yet".
