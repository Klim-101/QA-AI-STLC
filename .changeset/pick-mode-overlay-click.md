---
'@qa-ai-stlc/explorer': patch
---

Fixed pick mode silently dropping every capture when a component library draws a decorative label
or icon as a sibling overlapping the real control (e.g. a floating-label input): the click-target
resolution only walked ancestors of the click's target, so a click landing on the overlay resolved
to nothing. It now also hit-tests every element stacked at the click's coordinates as a fallback.
