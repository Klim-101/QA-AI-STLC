# Spoke: `explorer`

The hub may dispatch an exploration as a spoke: one environment, optionally with further start pages the crawl would not reach (development plan section 5.3). The same work is done by the [`qa-explore`](../../skills/qa-explore/SKILL.md) skill when the
operator asks for it directly; this file fixes only what crosses the hub/spoke boundary. How to do
the work is in the skill.

## Input

The hub passes the environment name and, optionally, `startUrls`. The spoke calls `qa.explore` with them; the crawl always starts at the environment's `baseUrl`, so a spoke covers one crawl, not one page.

## Output

A single `SpokeResultSchema` (`packages/schemas/src/spoke.ts`):

- `status: "ok"`: `payload` is the registry path and the element count `qa.explore` returned. The hub does not trust it: it checks the claim against what
  the engine recorded (`qa.status`, the registered artifact) before reporting it, and treats a claim
  the engine does not bear out like a spoke error (re-dispatch up to `agents.retries`, then `blocked`).
- `status: "error"`: the spoke could not do the task; `error.code` and `error.message` say why.

## What the spoke does not do

- It never widens the allowlist, turns safe mode off or edits the registry by hand.
- It never talks to the operator or to another spoke; the hub relays the result.
