---
'@qa-ai-stlc/core': patch
---

Fix `GateStateMachine.approve()` accepting any manifest-registered artifact for any gate:
`#278` required the artifact at `artifactPath` to be manifest-registered, but `artifactPath` was
still a free-form, caller-supplied string with no mapping from a gate name to the artifact it
actually expects. Approving `scope` with a completely unrelated, engine-registered artifact (for
example one meant for a different gate) satisfied the gate and advanced `currentPhase`.

`approve()` now checks `artifactPath` against a canonical binding per gate before accepting it:
`scope` binds only to `artifacts/scope.json`; `cases` binds to any path under `artifacts/cases/`,
since each test case is its own file rather than a single rollup artifact. A mismatch is rejected
with `GATE_ARTIFACT_PATH_MISMATCH` instead of silently satisfying the wrong gate.
