---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/runner-playwright': patch
---

`verifyGeneratedTestSpec` now requires the `TestCase` a generated spec claims to codify and checks
execution coverage against that case's own canonical step/expected-result ids (`canonicalStepIds`),
never the spec's own self-declared `stepIds` annotation. Previously coverage was checked only
against what the candidate spec itself chose to declare, so a spec with an empty body (only a
`testCaseId` annotation, no assertions, no `stepIds` declaration) reported `passed` and was accepted
as `'verified'`. `Runner.run()` gained an optional `requiredStepIds` input that
`runner-playwright`'s `mapReportToRunResults` honors as the authoritative required set when given,
overriding the spec's own declaration; ordinary `qa run` over hand-written specs is unaffected.
