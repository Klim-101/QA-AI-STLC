---
'@qa-ai-stlc/explorer': major
---

Fix `computeElementId` prioritizing locator-quality signals (`accessibleName`, `label`) over
`testId` when computing an element's identity, and having no disambiguator for two distinct
elements that share the same signal on one page. `accessibleName`/`label` can legitimately change
with live page content (a "Cart (3)" button's accessible name changes the moment the badge count
does), so an element whose `data-testid` never changed was still getting a new `elementId` on
every crawl where that text differed — breaking continuity for anything keyed by `elementId`
across crawls (degraded-selector tracking, evidence links). Two elements sharing the same name on
one page (e.g. two "Delete" buttons in a list) also collided outright, since the position-based
fallback was only ever used when every named signal was absent, never as a tiebreaker.

`computeElementId` now prefers `testId` first, and `createElementIdAssigner()` tracks an
occurrence index per `(url, kind, signal)` across one crawl or pick-mode batch so same-signal
duplicates never collide.

Breaking: stored `elementId` values change on the next `qa explore` run for elements whose
identity depended on `accessibleName`/`label` ranking above `testId` — expect every such element
to show up once as "removed" and once as "added" in that run's diff, not as a behavior change to
review, since the elements themselves have not changed.
