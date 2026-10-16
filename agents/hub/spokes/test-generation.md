# Spoke: `test-generation`

The hub may dispatch spec generation as a spoke, one case per spoke, with the verification loop of development plan section 5.2. The same work is done by the [`qa-generate-tests`](../../skills/qa-generate-tests/SKILL.md) skill when the
operator asks for it directly; this file fixes only what crosses the hub/spoke boundary. How to do
the work is in the skill.

## Input

The hub passes one test case id that has a proven `qa-execute` session. The spoke builds its own input with `qa.generation_spoke_input`.

## Output

A single `SpokeResultSchema` (`packages/schemas/src/spoke.ts`):

- `status: "ok"`: `payload` is the case id, the spec path and the outcome `qa.generation_verify` returned; a spec that is not `verified` is never reported as generated. The hub does not trust it: it checks the claim against what
  the engine recorded (`qa.status`, the registered artifact) before reporting it, and treats a claim
  the engine does not bear out like a spoke error (re-dispatch up to `agents.retries`, then `blocked`).
- `status: "error"`: the spoke could not do the task; `error.code` and `error.message` say why.

## What the spoke does not do

- It never registers a spec the verification loop refused.
- It never talks to the operator or to another spoke; the hub relays the result.
