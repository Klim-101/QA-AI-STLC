# ADR-0016: Cases declare structured expectations that the engine judges

Status: Accepted
Date: 2026-10-13

## Context

A test case ends in `expectedResult`, free text. #603 made `passed` depend on evidence: every step has
successful evidence, and a successful check of the case's type exists. But which check supports the
text is still the executing agent's claim: a `qa.browser_expect` for a different element, or any
response below 400, satisfies the rule. The engine cannot read the text, and an agent that wants a
green result can pick the cheapest check.

The engine already records what it observed in a comparable form: a `qa.browser_expect` record holds
its kind, selector, expected value and verdict; a `qa.http_execute` record holds the status and a
body preview; a scan record holds its violations. What is missing is the case saying, in the same
vocabulary, what it expects.

## Decision

A case may declare structured expectations, and the engine derives whether each is met from the
evidence a `passed` result cites. The caller supplies no comparison.

- `TestCaseStepSchema.expectations` (checks made in that step) and `TestCaseSchema.resultExpectations`
  (checks behind `expectedResult`, made in any step). Both are optional lists.
- The vocabulary is a closed union, `CaseExpectationSchema`:
  - browser, mirroring `qa.browser_expect`: `visible`, `hidden`, `text`, `value`, `count`, `checked`
    (each with a `selector`) and `url`;
  - response: `http-status` (an exact code) and `http-body-contains` (a fragment of the recorded
    body preview);
  - `a11y-clean`: a scan with no violations and nothing uncertain.
- A schema rule keeps the kinds to the case's type: response kinds only on `api` cases, `a11y-clean`
  only on `a11y` cases, browser kinds on `e2e` and `a11y` cases.
- **Matching.** An expectation is judged by the cited records that are about the same thing: for a
  browser kind, an `expect` record of the same kind, the same selector (the one the record resolved
  to) and the same expected value; for a response kind, a request record; for `a11y-clean`, a scan
  record. A step's expectations look only at records linked to that step, a result expectation at all
  of them. The newest matching record decides (a scan has no time and the later citation wins), so a
  failed attempt that a later one corrected does not count against the case.
- **Verdicts.** `met`, `unmet` (checked and failed) or `unobserved` (never checked as declared). A
  record for a different target or value is a different check, so it cannot stand in for the declared
  one.
- **The rule.** `passed` is refused with `RUN_RESULT_EXPECTATION_UNMET` while any declared
  expectation is not `met`, naming each with its verdict. This comes after the #603 step check, and a
  case that declares expectations is not also asked for the generic "a successful check exists" rule:
  its declared checks are the stricter form of it.
- **An expected error response.** A step that declares an `http-status` expectation counts its
  request as performed whatever the status, since the expectation then decides whether the status is
  the right one. This lifts the #603 limit that an api case expecting 404 could never be `passed`.
- **Compatibility.** The fields are additive and optional, so a case written before this ADR
  validates and keeps the #603 rule unchanged; no schema version bump or migration is needed.
  `qa-design-cases` writes the structure for new cases.

**Not adopted:**

- Parsing `expectedResult`. It is prose for people; deriving a verdict from it would be the engine
  guessing.
- Matching by element role or text instead of selector. A selector the case names is what the agent
  has to check, and the registry already stores selectors for the application.
- Lifting `qa.browser_expect` into a case-level tool that takes the case id. The matcher needs no new
  tool: the agent runs the existing check with the declared parameters and cites it.
- JSON-path or regular-expression body matching. A plain fragment is checkable by anyone reading the
  case; richer matching can be added to the union when a real case needs it.

## Consequences

"Actual equals expected" becomes something the engine derives for the checks a case declares. An
agent can no longer pass a case by running a different, easier check.

The case author carries the cost of the structure, and a wrongly declared selector or value makes the
case unable to be `passed` until corrected: the refusal names the expectation, and the fix is a case
edit, not an engine override. A declared check also ties the case to the selector, so a changed
selector is a case change.

What the engine compares is still a record of what the page or response showed through the engine's
own tools; it does not know the declared check is the right one for the requirement. The case review
at the `cases` gate stays the place a person judges that, and the readable copy of each case lists the
declared checks for exactly that purpose.

A body fragment is searched in the capped preview only, so a fragment beyond the cap is `unmet`.

## Amendment: generated specs assert what the case declares (P6-86)

`qa.generation_spoke_input` renders each declared expectation as the assertion line a spec needs, and
`qa.generation_verify` looks for that line before it runs the spec, answering `expectations_missing`
for what is absent. The lines are derived again from the registered case, the registry and the
locator module on disk, so the list the verification uses is not the one the caller handed in. A
step's line has to sit in that step's `test.step`; a result expectation may sit in any. Comments and
whitespace do not count. Selectors reach the spec only as locator-module functions: an expectation
whose selector matches no registry element (by CSS or `execute` value, `data-testid` attribute or
`role=` form), or whose element has no function, is listed as unresolved and not asserted.

This checks that the assertion is written, not that it is reached: the run that follows proves it
passes, and the per-step work check proves each step did something, but a line inside code that never
runs would satisfy the text check. The case review stays the place a person judges whether the
declared checks are the right ones.
