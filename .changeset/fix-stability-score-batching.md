---
'@qa-ai-stlc/explorer': minor
---

Fix stability scoring discarding its own result and reloading the page once per element.
`buildSelectorRegistry` scored only the policy-picked primary candidate and then ignored the
score when choosing which candidate to keep, so a lower-priority candidate that would have scored
more stable than the policy-preferred one was never surfaced or used. Scoring also reloaded the
page and resized the viewport once per interactive element — 200 reloads to score one 200-element
page.

`scorePageCandidates` (new) batches every check (unique now, survives one shared reload, survives
each shared viewport resize) across every candidate of every element on a page in a single pass,
scoring every synthesized candidate rather than only the primary. `buildSelectorRegistry` now
promotes whichever candidate actually scored highest to `locatorCandidates[0]` instead of trusting
policy order alone.

Not breaking: `scoreLocatorStability` (single-candidate scoring, used by `qa explore --verify`) is
unchanged. Expect `qa explore`'s registry diff to show more `degraded`/reordered entries on the
next run for pages where a non-primary candidate now proves more stable than the policy-picked
one — a more accurate result, not a regression.
