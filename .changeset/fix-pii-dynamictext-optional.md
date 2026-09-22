---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/explorer': patch
---

Fix `pii`/`dynamicText` on a selector registry element being required booleans that every
producer (crawl, static analysis, pick mode) hardcoded to `false`, with no detection logic
anywhere in the repo. A required `false` read as "checked, and clean" — a claim nothing had
verified (AGENTS.md 12.5, honest statuses).

`SelectorElementSchema` now makes both fields optional; every producer omits them instead of
asserting `false`, so a consumer can tell "not yet evaluated" from an actual check that found
nothing. Not breaking: an existing registry with `pii: false`/`dynamicText: false` still validates
unchanged, and no consumer branches on either field today.
