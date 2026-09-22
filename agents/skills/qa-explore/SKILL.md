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
`qa.explore` actually does today: crawling and static source analysis feed the registry;
API-surface mapping is not implemented yet (see [Not yet in scope](#not-yet-in-scope)).

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

## What this skill does not do

- **Manual pick mode is CLI-only.** `qa explore --pick <url>` opens a headed browser for the
  _operator_ to click through — it cannot run over MCP's stdio transport (AGENTS.md 12.4). If the
  registry is missing a locator this skill cannot resolve by crawling, tell the operator to run pick
  mode themselves; do not attempt it as a spoke task.
- It does not write test cases or dispatch execution — that is `qa-design-cases` and later skills.
- It does not re-implement the explorer's crawl, static-analysis or scoring logic; it calls
  `qa.explore` and reports the structured result.

## Not yet in scope

API-surface capture (`endpoints.json`, OpenAPI discovery/synthesis) is planned for
[P6-01](https://github.com/Klim-101/QA-AI-STLC/issues/75) and later, not implemented yet. This
skill covers the selector registry only. **When P6-01 lands, this file must be updated** to add the
new tool call and how to read its result — P6-01's own exit criteria include updating this skill,
so do not let this note go stale once that task is picked up.

This skill also reports its own result directly to the operator rather than handing off through a
shared "what's next" mechanism — that mechanism does not exist yet
([P2-21](https://github.com/Klim-101/QA-AI-STLC/issues/260)). **When P2-21 lands, revisit this
file** to route the end-of-run summary through it instead of ending here.
