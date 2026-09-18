---
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/core': minor
---

`qa init` now runs the testing scope survey (development plan section 2.7): Web E2E, API, accessibility and security are answered independently with `--e2e`, `--api`, `--a11y` and `--security` (each `in-scope` or `out-of-scope`), plus optional `--source-path` and, when API is in scope, `--api-source`. `qa init` refuses to finish with a type left `undecided` unless `--defer-scope` is passed, so a project never silently starts with a scope nobody decided.

Add `qa config set testing.<type> <in-scope|out-of-scope|undecided>` to change one testing type's scope decision later, preserving the rest of `config.yaml` (including comments and formatting).

`qa doctor` gains two checks: `source-path` (is `source.path` readable) and `api-contract` (is `api.source` reachable — over HTTP for a URL, on disk for a local file; `"discover"`/`"synthesize"` are not checked, since neither is a file or a URL).

`@qa-ai-stlc/core` exports the two new doctor checks, `checkSourcePathReadable()` and `checkApiContractReadable()`.
