---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
---

Add `qa scope --from file --path <path>` and `qa scope --from text --content <text> --label <label>`: deterministic, rule-based requirement extraction into `artifacts/scope.json` (the framework never fetches requirements from a tracker). A level-2 Markdown heading (`## Title`) becomes one requirement; repeated calls upsert by requirement id instead of duplicating or replacing the whole set, so a later source's content for the same requirement wins while other requirements (and any hand-edited `inScope`) are left untouched. The scope artifact is registered in `manifest.json` on every write, same as the selector registry.

`@qa-ai-stlc/core` gained the underlying `extractRequirements` and `mergeRequirements` functions.
