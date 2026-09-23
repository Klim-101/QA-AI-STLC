---
'@qa-ai-stlc/explorer': patch
---

Fix `analyzeStaticSource` silently discarding every finding past a tag whose quote or `{...}`
brace tracking never balances before the end of the file: `#281`'s `findTagEnd` returns `-1` in
that case, and the caller treated `-1` the same as "no more tags in the file," aborting the whole
scan. A single confusing construct anywhere in a file (an apostrophe inside a regex literal, an
unbalanced brace inside a template literal) could silently drop a large fraction of a "missing
test ID" report with no error or warning.

`findStaticElements` now resumes scanning right after the unclosed `<` instead of aborting the
file, treating it as literal text — the same accepted false-positive/false-negative risk the
scanner already documents, not a new failure mode that cascades across the rest of the file.
