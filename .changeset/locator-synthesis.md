---
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/schemas': minor
---

Add locator synthesis to `@qa-ai-stlc/explorer`: `synthesizeLocatorCandidates()` builds an ordered `LocatorCandidate[]` for an interactive element under three policies — `playwright-default` (role, testId, label, placeholder, text, CSS last), `testid-first`, and `strict-no-css` (never emits the CSS fallback). CSS candidates are always flagged `fragile: true` and built from a captured tag name and sibling position, so an element with no accessible role, label, placeholder or text still gets a candidate.

`@qa-ai-stlc/schemas`'s `InteractiveElement` gained the raw attributes locator synthesis needs (`role`, `label`, `placeholder`, `htmlId`, `tagName`, `nthOfType`), captured by the same page-element extraction added in P1-07 and subject to the same untrusted-data length caps.
