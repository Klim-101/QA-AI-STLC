---
'@qa-ai-stlc/core': major
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/mcp-server': patch
---

Fix `qa approve`/`qa.approve` accepting any existing file as a gate's artifact, and the approval
ledger being unprotected against a hand-edit — together these let a gate approval be forged with
nothing detecting it: editing an artifact, recomputing its hash, and writing that hash into the
corresponding ledger entry used to pass `qa validate` as a genuinely approved gate.

`GateStateMachine.approve()` now requires the artifact to be manifest-registered — the content the
engine itself last wrote to that path — throwing the existing `ARTIFACT_UNREGISTERED` /
`ARTIFACT_HASH_MISMATCH` coded errors instead of silently approving. `ApprovalLedgerStore` now
registers `artifacts/approval-ledger.json` in the manifest on every append, so a hand-edit to the
ledger itself is caught by `qa validate`'s tamper check the same as any other artifact.

Breaking for `@qa-ai-stlc/core`: `ApprovalLedgerStoreOptions` and `GateStateMachineOptions` both
gain a required `manifest: ManifestStore` field.
