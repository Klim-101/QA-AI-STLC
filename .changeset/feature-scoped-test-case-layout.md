---
'@qa-ai-stlc/schemas': major
'@qa-ai-stlc/core': major
---

`TestCaseSchema` requires a new `feature` field (P2-20): an explicit, kebab-case, operator-chosen
name for the tested feature a case belongs to (`FeatureIdSchema`, `packages/schemas`), never
inferred from the case's title or a requirement id. This is a breaking schema change — an existing
case JSON file without `feature` now fails validation and must be updated before it can be
registered again.

`qa cases add` / `qa.cases_add` now register a case under `artifacts/cases/<feature>/<id>.json`
instead of the previous flat `artifacts/cases/<id>.json`, using the case's own `feature` field. `qa
validate` already lists `artifacts/cases/` recursively, so it reads a case at any folder depth; it
still requires every case file, wherever it lives, to carry a valid `feature` — an existing flat
case file needs `feature` added before `qa validate` can read it again.
