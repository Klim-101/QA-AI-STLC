# Executing an `a11y` case

Requires an open browser session on the page the case targets — usually reached by following the
case's own preconditions/steps with `qa.browser_navigate` first, the same as an `e2e` case, but
without needing `executionMode` unless a step also submits a form. Once on the right page, call
`qa.browser_accessibility_scan` with the session id.

## Reading the result

`violationCount` is a count, not a verdict (the engine never decides pass or fail, ADR-005's
principle applied here too). Read the registered scan evidence — the raw axe-core result — and
compare its `violations` against the case's expected result yourself: a case that expects "no
critical violations" is not automatically satisfied by `violationCount === 0` if the case's own
expected result names a narrower or differently-scoped check.

## One scan is one piece of evidence

A case covering more than one page or state scans each one separately (navigate, scan, navigate,
scan), collecting every scan's evidence id for `qa.case_result_register` — do not try to cover
multiple pages with a single scan call.
