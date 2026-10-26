---
'@qa-ai-stlc/core': patch
---

The declared-expectation check now reads a test inside `test.describe` (including `.serial`, `.parallel`, `.only` and nested describes), as it does a top-level test, so a spec written the way the generation standards describe is no longer rejected. A test in `test.describe.skip` or `.fixme` still counts as one that never runs.
