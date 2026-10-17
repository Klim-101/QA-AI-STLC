# Spoke: `reviewer`

The hub may dispatch the independent review of a generated spec as a spoke, one spec per spoke
(development plan section 5.3). The reviewer checks another spoke's output without seeing its
reasoning, using engine tools and not the text alone. There is no skill for it yet: this file is what
the spoke follows, and the generated `qa-reviewer` subagent carries the same rules.

## Input

The hub passes the case id and the path the spec was registered under, and nothing else: not the
generating spoke's output, not its reasoning. The spoke builds its own input with `qa.review_input`,
which the engine assembles from registered artifacts, so the author's argument cannot reach it. The
generated `qa-reviewer` subagent also has no file, shell or web tool (`disallowedTools`), so it cannot
open the author's spoke records in the project either; the engine's own tools are what it has. The
input has the case, the spec as registered, the verification that let it be registered and, per
assertion, what the engine found:

- `tautology` (error): the assertion is about a literal, so it holds whatever the application does.
- `inline-locator` (error): the element is found with a selector written into the spec, not a
  locator-module function.
- `unknown-locator` (error): the locator function is not one the locator module exports.
- `ungrounded-value` (warning): an expected value that neither the case nor its proven session
  contains.

## What the spoke does

- **Runs and checks, not only reads.** `qa.spec_check` runs the spec and records nothing, so a review
  adds no run to the history `qa report`, flaky detection and triage read (`qa.run` would); `qa.explore` with `verify` re-checks the
  registry's locators against the live page. A spec that passes can still assert nothing.
- **Judges each assertion** against the case's steps and expected result: does it check what the case
  says, with a value the case or the session gives?
- **Records the verdict** with `qa.review_add`: `approved` or `rejected`, the reasons, and a waiver
  (assertion id, finding code, reason) for each warning it accepts. The review is bound to the spec's
  exact content (`specSha256`).

## What the engine refuses

- Approving a spec with an `error` finding: it can only be rejected (`REVIEW_APPROVAL_BLOCKED`).
- Approving with a warning left unexplained (`REVIEW_WARNING_NOT_WAIVED`), or waiving a finding the
  engine does not raise (`REVIEW_WAIVER_UNKNOWN`).
- Reviewing a spec that is not registered, was edited since, or belongs to another case.
- A review of another version of the spec than the registered one (`REVIEW_SPEC_CHANGED`).

## Output

A single `SpokeResultSchema` (`packages/schemas/src/spoke.ts`): `status: "ok"` with `payload`
`{ testCaseId, verdict, reviewPath }` after `qa.review_add` registered the review, or `status: "error"`
with `error.code` and `error.message`. A rejection is an `ok` result: the spoke did its job. The hub
reads the registered review back before relying on the claim, and sends a rejected spec back to the
generating spoke with the review's reasons, never with the reviewer's own reasoning about the author.

## What the spoke does not do

- It never edits or regenerates the spec; it judges it.
- It never registers a spec or approves a gate.
- It never talks to the operator or to another spoke; the hub relays the result.
