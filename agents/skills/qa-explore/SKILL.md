---
name: qa-explore
description: >-
  Use when the operator wants to build or refresh the selector registry ("explore the app",
  "crawl the app for testable elements", "update the registry", "check if the registry is still
  valid", "why doesn't this locator work anymore"). Never use for starting a new session (that is
  `qa-start`) or for case design / execution work once elements already exist in the registry.
triggers:
  - 'explore the app and build the selector registry'
  - 'crawl the staging environment'
  - 'refresh the registry, some selectors might be stale'
  - 'why is this locator failing now'
nonTriggers:
  - 'start a QA session for this project'
  - 'write test cases for the login flow'
  - 'run the checkout test case'
---

# `qa-explore` — selector registry

Fires when the operator wants the selector registry built or re-checked. Scoped to what
`qa.explore` actually does today: crawling and static source analysis feed the registry, and the
same crawl also derives a discovered API surface (`endpoints.json`, see
[Reading the result](#reading-the-result)). OpenAPI discovery/diff and synthesis are not
implemented yet (see [Not yet in scope](#not-yet-in-scope)).

## Ask before calling anything

Before the first `qa.explore` call, ask the operator explicitly rather than assuming defaults:

1. **Fresh crawl or verify?** A new/extended registry (`qa.explore`) or a live re-check of the
   stored registry (`qa.explore` with `verify: true`) — these answer different questions and are
   never picked silently from phrasing alone.
2. **Static analysis too?** Whether to merge in framework-attribute analysis of `source.path`
   (`static: true`) alongside the crawl. Only relevant when doing a fresh crawl.
3. **Which environment/identity?** Required when `config.yaml` has more than one of either; skip
   the question when there is only one.
4. **Expect any pages the crawler cannot reach?** Login walls, multi-step wizards or canvas-heavy
   UI a crawler cannot drive reliably. If the operator names any, tell them up front that those need
   manual pick mode (`qa explore --pick <url>`, operator-run — see
   [What this skill does not do](#what-this-skill-does-not-do)) rather than only surfacing it later
   if `missingLocatorCount` turns out non-zero.

## What this skill calls

1. **`qa.doctor`**, if not already confirmed this session (`qa-start` normally does this at session
   start) — an explore against a broken environment produces a misleading, mostly-empty registry
   rather than a clear error, so confirm the environment first when in doubt.
2. **`qa.explore`**, with the answers from the survey above: `environment`/`identity`, `static`,
   `maxPages` to bound the crawl if the operator wants a cap, or `verify: true` for the re-check
   path instead of a crawl.

## Reading the result

- `added` / `removed` — elements newly found or dropped since the last stored registry. Report the
  counts; a large, unexpected drop is worth flagging to the operator before continuing rather than
  treating it as routine.
- `degraded` (`verify` mode only) — a stored, previously-working selector no longer resolves the
  same way live. Each entry names the element and its previous vs. current stability score. Surface
  these to the operator; do not silently re-crawl over a degraded selector without saying so.
- `missingLocatorCount` — elements the explorer found but could not synthesize any locator for.
  These need the operator's attention (a manual pick, or a `data-testid` added to the source) before
  a case can target them.
- `blockedRequestCount` — non-GET requests safe mode blocked during the crawl. Non-zero is expected
  behavior, not a failure; mention it only if the operator asks what the crawl touched.
- `endpointsPath` / `endpointCount` — where the discovered API surface was written
  (`.qa/selectors/endpoints.json`) and how many endpoints it holds after merging with whatever was
  already stored there. Each entry is `{ method, path, source: 'discovered', examples }`: `path`
  has record-id segments collapsed to `{id}` (`/tasks/1`, `/tasks/2` → `/tasks/{id}`), and
  `examples` keeps a capped sample of the raw paths that collapsed into it, so a reviewer can check
  the collapse was correct instead of trusting it blindly. This is traffic the crawl itself
  observed, not a contract — treat a large `endpointCount` as informational, not something to report
  unprompted, unless the operator is specifically working toward API test generation
  ([P6-04](https://github.com/Klim-101/QA-AI-STLC/issues/78) and later).

Exploring is not itself a gated phase (`packages/core/src/phases.ts`'s `PHASES` has no `explore`
entry), so do not stop after presenting the counts above. Read `.qa/state.json`'s `currentPhase`
and relay that phase's own next step the same way a gate approval would
([`agents/hub/HUB.md`](../../hub/HUB.md#announcing-what-comes-next)) — for example, if `scope` is
still open, point at [`agents/phase-prompts/scope.md`](../../phase-prompts/scope.md) rather than
ending on the registry report alone.

## What this skill does not do

- **Manual pick mode is CLI-only.** `qa explore --pick <url>` opens a headed browser for the
  _operator_ to click through — it cannot run over MCP's stdio transport (AGENTS.md 12.4). If the
  registry is missing a locator this skill cannot resolve by crawling, tell the operator to run pick
  mode themselves; do not attempt it as a spoke task.
- It does not write test cases or dispatch execution — that is `qa-design-cases` and later skills.
- It does not re-implement the explorer's crawl, static-analysis or scoring logic; it calls
  `qa.explore` and reports the structured result.

## Not yet in scope

OpenAPI discovery/diff ([P6-02](https://github.com/Klim-101/QA-AI-STLC/issues/76)) and synthesized
drafts ([P6-03](https://github.com/Klim-101/QA-AI-STLC/issues/77)) are not implemented yet: the
discovered `endpoints.json` this skill reports on is traffic the crawl observed, not a contract
diffed against or synthesized into an OpenAPI document. **When P6-02/P6-03 land, this file must be
updated** to cover diffing and synthesis — do not let this note go stale once those tasks are
picked up.
