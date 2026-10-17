---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
'@qa-ai-stlc/cli': minor
---

The `qa-regression` skill and `qa.regression_plan` (also `qa regression plan --max-tier <tier>`). The engine selects the regression pack for a tier threshold (smoke, critical-path, regression, extended: a pack takes every tier up to the one named) from the registered cases, the run history and the verifications it holds: an approved case is in when its tier is at or below the threshold and its history is not flaky by the configured thresholds, and every case that is out carries its reason (`not-approved`, `no-tier`, `tier-above-threshold`, `flaky`). Each case in is routed to its verified generated spec (grouped for `qa.run`, one call per test type) or to live execution with the reason there is no spec (`no-verified-spec`, `stale-spec`, `spec-changed`). The skill shows the plan, asks before live execution, runs both routes and says what came back.
