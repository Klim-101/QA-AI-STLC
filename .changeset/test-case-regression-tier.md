---
'@qa-ai-stlc/schemas': minor
---

Extend `TestCaseSchema` with two optional, ISO/IEC/IEEE 29119- and ISTQB-aligned fields (P2-17):
`preconditions` (an array of strings, state that must hold before the first step) and
`regressionTier` (`RegressionTierSchema`, one of `smoke` < `critical-path` < `regression` <
`extended`, ordered from narrowest to widest run via the exported `REGRESSION_TIERS` tuple).
`qa-design-cases` (P2-09) will set both on every case it writes; existing cases without them
remain valid, since neither field is required.

Adds `agents/references/testing-standards.md`, a shared reference on test-design techniques, the
`TestCaseSchema`/`DefectDraftSchema` field conventions, and the regression-tier definitions, so
`qa-design-cases`, `qa-execute` (P3-15) and `qa-generate-tests` (P3-07) can point to it instead of
each restating the same background.
