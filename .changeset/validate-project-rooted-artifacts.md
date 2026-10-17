---
'@qa-ai-stlc/schemas': patch
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
---

`qa validate` no longer reports a registered generated spec as tampered. A manifest entry can name the tree its path is relative to (`root`, `project` for a generated spec and the locator module, absent for `.qa/`), and the sweep looks for the file there. An entry registered before `root` existed is looked for under `.qa/` first, then in the project, so manifests already on disk keep working; an edited or deleted spec is still reported.
