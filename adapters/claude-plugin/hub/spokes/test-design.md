# Spoke: `test-design`

The hub may dispatch test case design as a spoke, one feature or requirement per spoke. The same work is done by the [`qa-design-cases`](../../skills/qa-design-cases/SKILL.md) skill when the
operator asks for it directly; this file fixes only what crosses the hub/spoke boundary. How to do
the work is in the skill.

## Input

The hub passes one feature or requirement id. The spoke reads the requirement and the registry itself through engine tools, never from the hub's recollection.

## Output

A single `SpokeResultSchema` (`packages/schemas/src/spoke.ts`):

- `status: "ok"`: `payload` is the ids of the cases the spoke registered with `qa.cases_add`. The hub does not trust it: it checks the claim against what
  the engine recorded (`qa.status`, the registered artifact) before reporting it, and treats a claim
  the engine does not bear out like a spoke error (re-dispatch up to `agents.retries`, then `blocked`).
- `status: "error"`: the spoke could not do the task; `error.code` and `error.message` say why.

## What the spoke does not do

- It never approves the `cases` gate: `qa.approve` is the operator's step, relayed by the hub.
- It never talks to the operator or to another spoke; the hub relays the result.
