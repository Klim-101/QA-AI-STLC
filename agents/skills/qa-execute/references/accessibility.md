# Executing an `a11y` case

Requires an open browser session on the page the case targets — usually reached by following the
case's own preconditions/steps with `qa.browser_navigate` first, the same as an `e2e` case, but
without needing `executionMode` unless a step also submits a form. Once on the right page, call
`qa.browser_accessibility_scan` with the session id.

## Reading the result

The scan runs against the project's configured `a11y` target (WCAG version, cumulative level,
best-practice rules, include/exclude selectors), so its evidence records the axe-core version and a
hash of that configuration.

`violationCount` is a count, not a verdict (the engine never decides pass or fail, ADR-005's
principle applied here too). Read the registered scan evidence and compare its `violations` against
the case's expected result yourself: a case that expects "no critical violations" is not
automatically satisfied by `violationCount === 0` if the case's own expected result names a
narrower or differently-scoped check.

- `uncertainCount` / `uncertain`: axe-core could not decide (for example text over a gradient) and
  a person has to look. Report the case `uncertain` for them, never `passed`.
- `exceptedCount` / `excepted`: known issues the team accepted in config, each with its reason.
  They are not violations, but mention them in the report so they stay visible. An entry under
  `expiredExceptions` has lapsed and its violation is counted again.

## One scan is one piece of evidence

A case covering more than one page or state scans each one separately (navigate, scan, navigate,
scan), collecting every scan's evidence id for `qa.case_result_register` — do not try to cover
multiple pages with a single scan call.
