---
name: _example
description: >-
  TEMPLATE, NOT A SHIPPED SKILL. Demonstrates the SKILL.md format agents/README.md defines. Never
  loaded by a real host; kept only so the ~200-line lint and future skills have a concrete file to
  point at.
triggers:
  - 'show me an example of a SKILL.md file'
  - 'what does the skill format for this repo look like'
nonTriggers:
  - 'explore the app and build the selector registry'
  - 'design test cases for the checkout flow'
references:
  - references/example-reference.md
---

# `_example` — SKILL.md template

This file is a **format template**, not a real skill. It exists so `agents/README.md`'s SKILL.md
rules have a concrete file to point at, and so `scripts/lint-agents.mjs` has a real file to lint
against. No host should ever load a skill named `_example`; the leading underscore and this
paragraph both mark it as non-production.

## When this fires

A real skill's `description` field is the only thing a host uses to decide whether to load it. It
states concrete trigger phrases ("Use when ...") rather than describing what the skill does
(AGENTS.md 12.2). This template's own `description` above follows that shape, but its trigger is
"someone wants to see the template," which is why it does not resemble a QA workflow.

## What a real skill's body does

A real skill's body, after the frontmatter:

1. Restates its trigger in one line, for a human skimming the file.
2. Names the engine tool(s) it calls — an MCP tool such as `qa.explore` or `qa.cases_add` — and
   explains how to interpret the structured result the tool returns. It never re-implements what
   the tool already does.
3. Points to `references/*.md` for detail that is only needed occasionally: full field-level
   schemas, edge cases, worked examples. The body itself stays on the common path.

## What a real skill's body does not do

- It does not restate a rule the engine already enforces. Phase order, gate approval and evidence
  registration are state-machine behavior (AGENTS.md 12.1); a skill does not add "you must" prose
  for any of them.
- It does not exceed roughly 200 lines. This template file is well under that on purpose, leaving
  headroom for a real skill's larger body before it needs to move detail into `references/`.

## Reference material

See [`references/example-reference.md`](references/example-reference.md) for the kind of detail
that belongs in a reference file instead of here: it is loaded on demand, not on every session, so
it carries no line budget of its own.
