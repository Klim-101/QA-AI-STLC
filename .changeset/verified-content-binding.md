---
'@qa-ai-stlc/core': patch
---

`verifyGeneratedTestSpec`'s `'verified'` outcome now carries a `contentSha256` of the exact content
that was typechecked and executed, and `registerVerifiedGeneratedTestSpec` rejects a mismatch
between that hash and the `GeneratedTestSpec.content` it is asked to write. Previously the two were
never compared, so a caller could verify one spec and register a completely different one under the
same `testCaseId`, defeating the verification loop (P3-06).
