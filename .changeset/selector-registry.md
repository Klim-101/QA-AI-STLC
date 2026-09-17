---
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/schemas': minor
---

Add the selector registry to `@qa-ai-stlc/explorer`: `buildSelectorRegistry()` assembles a `SelectorRegistry` from a `PageModelSet`, synthesizing locator candidates for every interactive element and scoring the primary candidate's stability in a fresh live pass over the same URLs. Each element gets a stable `elementId` derived from its page, kind and best available name, so it survives a DOM reorder across two crawls. `mergeSelectorRegistry()` keeps history on re-crawl: an element the fresh crawl no longer finds is kept, not deleted, with `deprecatedAt` stamped the first time it goes missing. `diffSelectorRegistry()` reports elements added, removed or degraded (a lower stability score) between two crawls.

`@qa-ai-stlc/schemas`'s `SelectorElementSchema` now allows an empty `locatorCandidates` array: the `strict-no-css` synthesis policy can legitimately find no candidate at all for an element with no role, test ID, label, placeholder or text signal, and the element is still recorded (with `stabilityScore: 0`) instead of being silently dropped.
