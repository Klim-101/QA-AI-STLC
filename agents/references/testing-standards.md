# Testing standards reference

Shared background for any skill that designs, executes or triages test cases, aligned with the
concepts in ISO/IEC/IEEE 29119 (software testing) and the ISTQB syllabus. This file exists so that
terminology and structure are defined once and referenced by name — `qa-design-cases` (P2-09),
`qa-execute` (P3-15) and `qa-generate-tests` (P3-07) point here instead of each restating it
(P2-17).

This is background knowledge for a skill's own reasoning, not a set of rules the engine enforces —
where a rule below is checkable, the engine already checks it (`TestCaseSchema`, `DefectDraftSchema`
in `packages/schemas`; AGENTS.md 12.1). A skill uses this file to write _good content_ into fields
the schema already requires or accepts, not to invent new obligations.

## Test-design techniques

A test case earns its place in the suite when it targets a specific risk, not just "more coverage."
Pick a technique for the input or behavior being tested, don't apply all of them everywhere:

- **Equivalence partitioning** — group inputs that should behave the same way, test one
  representative per group instead of every value.
- **Boundary value analysis** — test at and immediately around a boundary (minimum, maximum,
  just inside, just outside), where off-by-one defects concentrate.
- **Decision table testing** — for behavior driven by a combination of conditions, enumerate the
  combinations that matter and test each row once, rather than testing conditions independently.
- **State transition testing** — for behavior that depends on prior state (a wizard, an order
  status, a session), test the transitions themselves (valid and invalid), not only the states.
- **Exploratory testing** — unscripted investigation guided by a charter (what to explore, why,
  what to look for) when the risk is unknown enough that a scripted case would miss it; the
  engine's `qa.browser_*` tools (ADR-005) still own every action and screenshot, so an exploratory
  session is exploratory in _design_, not in evidence discipline.

## Case structure (`TestCaseSchema`)

Every field below exists in `packages/schemas/src/test-case.ts`; this section is guidance on
filling it well, not a restatement of the Zod contract:

- **`feature`** — the tested feature this case belongs to, kebab-case (`FeatureIdSchema`,
  `packages/schemas`), chosen explicitly by whoever writes the case, never inferred from the title
  or a requirement id. `qa cases add` files the case under `artifacts/cases/<feature>/<id>.json`
  (P2-20), so an existing feature's name is reused rather than a near-duplicate coined — check the
  registry before inventing a new one.
- **`preconditions`** — state that must hold before step one, stated as facts, not instructions
  ("the user is logged in as `viewer`", not "log in as `viewer`"). Omit it when a case has no
  precondition beyond "the application is reachable" — it is optional for exactly that reason.
- **`steps`** — one observable action per step, in the order a person or a spoke driving
  `browser.*`/HTTP/axe-core tools would actually perform them. A step is too coarse if its
  description hides more than one decision point.
- **`expectedResult`** — the single outcome that makes the case pass or fail. A case that needs
  several independent expected results is usually several cases.
- **`regressionTier`** — one tier per case (`RegressionTierSchema`, `packages/schemas`), not a
  multi-tag set:
  - `smoke` — the smallest set that proves the build isn't broken; runs on every change.
  - `critical-path` — the primary user journeys the product cannot ship without; runs frequently.
  - `regression` — broader coverage of previously working behavior; runs before a release.
  - `extended` — edge cases, rare combinations, low-traffic paths; runs on a slower cadence.
    `qa-regression` (P4-09) selects a run by threshold against this order (`REGRESSION_TIERS`), so a
    case one tier too high or too low changes what runs, not just how it reads.

## Defect-report structure (`DefectDraftSchema`)

A defect draft is tracker-neutral (AGENTS.md 2.3; the operator files it in their own tracker), but
its content still follows the same discipline a tracker issue would need:

- **`steps` / `expectedResult` / `actualResult`** — the same three-part shape as a test case's
  steps and expected result, plus what was actually observed. A defect without a clear
  expected-vs-actual contrast is a symptom report, not a defect report.
- **`environment`** — enough to reproduce: build, browser/OS, identity, data state. Omitting this
  is the single most common reason a real defect report goes stale before anyone acts on it.
- **`severityProposal`** (`DefectSeverityProposalSchema`) — the _impact_ of the defect if
  unfixed (`blocker` down to `trivial`), proposed by whichever skill files the draft. This is a
  proposal, not a decision: severity and priority (how urgently it gets fixed, which depends on
  release plans and business context the engine has no visibility into) are the operator's call at
  triage, not the skill's.
- **`evidencePaths`** — every claim in `actualResult` traces to registered evidence (screenshots,
  traces, logs); a defect draft citing something the engine did not register is not
  representable, the same evidence discipline as everywhere else in the pipeline (ADR-005).

## What this file is not

It does not define a skill's trigger wording, tool calls or output format — that is each skill's
own `SKILL.md`. It does not define the RCA format (`docs/dev/development-plan.md` section 2.4) or
the security-audit checklist (section 2.7) — those get their own reference files when the tasks
that need them land (P6-14+).
