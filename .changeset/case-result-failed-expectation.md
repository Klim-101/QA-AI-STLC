---
'@qa-ai-stlc/core': patch
---

Refuse to register a case result as `passed` while its run still holds a failed browser expectation (`RUN_RESULT_FAILED_EXPECTATION`). Every expectation under the run is considered, not only the cited evidence, and a failed expectation followed by a later passing one of the same step, target and kind counts as a retry.
