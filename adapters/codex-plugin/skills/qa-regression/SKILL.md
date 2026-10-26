---
name: qa-regression
description: >-
  Use when the operator wants a regression pack run ("run the smoke tests", "run the regression pack
  before the release", "run everything up to critical-path", "re-run the whole suite"). Never use to
  run one named case (`qa-execute`) or one named spec (`qa run`), to design or generate tests
  (`qa-design-cases`, `qa-generate-tests`), or to read results (`qa-report`). Does not fire on its
  own before a release; only on an explicit request.
triggers:
  - 'run the smoke tests'
  - 'run the regression pack before the release'
  - 'run everything up to critical-path'
  - 're-run the whole regression suite'
nonTriggers:
  - 'run the login spec'
  - 'execute the checkout case live'
  - "what's the status of the last run"
  - 'design a regression case for password reset'
---

# `qa-regression` — run a regression pack

Fires on an explicit request to run a pack of cases chosen by tier: the smoke tests, everything up
to critical-path, the whole suite. The engine chooses the pack and says why each case is in or out;
this skill shows that, runs it by the right route, and says what came back.

## What this skill does

1. **Read the threshold off the request.** The tiers run from narrow to wide: `smoke`,
   `critical-path`, `regression`, `extended`, and a pack takes every tier up to the one named.
   "The smoke tests" is `smoke`; "the regression pack" or "before the release" is `regression`;
   "everything" or "the whole suite" is `extended`. When the words do not settle it, ask which tier
   instead of choosing.
2. **Get the plan.** Call `qa.regression_plan` with `maxTier`. It runs nothing. Show the operator
   what it returned: the cases in the pack, by route, and every case that is out with its reason.
   Never leave a case out of what you say. The reasons are the engine's: `not-approved`, `no-tier`
   (the case has no `regressionTier`, so it cannot be placed against a threshold; offer to set one),
   `tier-above-threshold` and `flaky` (the recorded history flips by the configured thresholds).
3. **Ask before live execution.** A case routed `live` has no spec to run: `no-verified-spec`
   (never generated), `stale-spec` (the case was registered again after its spec was verified) or
   `spec-changed` (the spec file is missing or was edited). Executing it live is slow and may send
   non-GET requests the approved case calls for. When any case is `live`, say how many and why, and
   wait for a yes. When every case is routed `spec`, run at once.
4. **Run the spec route.** For each entry of `specRuns`, call `qa.run` once with its `specFiles` and
   `testType`. Use the environment and identity the operator names, otherwise the defaults. Keep the
   `runId` and counts it returns.
5. **Run the live route.** For each `live` case, follow the `qa-execute` skill with that case id, one
   case after another. A case that stays `blocked`, `skipped`, `uncertain` or `partial` stays that;
   never call it passed or failed.
6. **Say what happened.** Per route: the counts `qa.run` returned, and each live case's registered
   result. Then the cases left out, with their reasons, so the pack is not read as the whole suite.
   The pack passed only when every included case's result is `passed`. For results case by case or
   the traceability matrix, hand over to `qa-report`; do not re-derive them here.
7. **Name what a route reason asks for, and do nothing about it.** A `stale-spec` or `spec-changed`
   case wants its spec generated again (`qa-generate-tests`); a `no-tier` case wants a tier. Say so;
   do not do either without being asked.
8. `REGRESSION_TIER_INVALID` means the threshold was not a tier: ask again with the four names. Any
   other `QaError` is relayed with its own message and `remediation`.

## What this skill does not do

- It does not choose or change a case's tier, approve a case, or generate or regenerate a spec.
- It does not run a case the plan left out, and does not add one to make the pack bigger.
- It does not triage failures or file defects: those are separate steps the operator asks for.
- It does not fire on its own when a release approaches.
