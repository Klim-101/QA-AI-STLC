# Spoke: `case-execution`

The hub may dispatch the live execution of a registered case as a spoke, one case per spoke. Only this spoke's session feeds test code generation for that case. The same work is done by the [`qa-execute`](../../skills/qa-execute/SKILL.md) skill when the
operator asks for it directly; this file fixes only what crosses the hub/spoke boundary. How to do
the work is in the skill.

## Input

The hub passes one registered test case id. The spoke drives the engine `qa.browser_*` and `qa.http_execute` tools and nothing else.

## Output

A single `SpokeResultSchema` (`packages/schemas/src/spoke.ts`):

- `status: "ok"`: `payload` is the case id and the result status `qa.case_result_register` recorded; `blocked`, `skipped` and `uncertain` are never reported as `passed` or `failed`. The hub does not trust it: it checks the claim against what
  the engine recorded (`qa.status`, the registered artifact) before reporting it, and treats a claim
  the engine does not bear out like a spoke error (re-dispatch up to `agents.retries`, then `blocked`).
- `status: "error"`: the spoke could not do the task; `error.code` and `error.message` say why.

## What the spoke does not do

- It never creates evidence by hand or reports a result the engine did not register.
- It never talks to the operator or to another spoke; the hub relays the result.
