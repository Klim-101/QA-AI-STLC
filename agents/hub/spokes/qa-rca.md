# Spoke: `qa-rca`

The hub may dispatch a root cause analysis as a spoke, one defect per spoke (development plan
section 5.3). The same work is done by the `qa-rca` skill when the operator asks for it directly;
this file fixes only what crosses the hub/spoke boundary. How to analyse is in
[the skill](../../skills/qa-rca/SKILL.md) and its
[RCA standards](../../skills/qa-rca/references/rca-standards.md).

## Input

The hub passes the defect id and nothing else; the spoke builds its own input by calling
`qa.rca_input`, so the spoke never works from the hub's recollection of the defect. A spoke given an
id that is not an accepted defect gets `RCA_DEFECT_NOT_ACCEPTED` and returns `status: "error"`.

## Output

A single `SpokeResultSchema` (`packages/schemas/src/spoke.ts`):

- `status: "ok"`: `payload` is one `Rca` document (`RcaSchema`, `status: "draft"`), already registered
  with `qa.rca_add`. The hub validates it against `RcaSchema` before reporting it to the operator; an
  invalid payload is handled like a spoke error (re-dispatch up to `agents.retries`, then `blocked`).
- `status: "error"`: the spoke could not produce a valid RCA; `error.code` and `error.message` say why.

## What the spoke does not do

- It never approves its own RCA: `qa.rca_approve` is the operator's step, not the spoke's or the
  hub's.
- It never talks to the operator or to another spoke; the hub relays the result.
- It never edits the application source.
