# `agents/` — canonical agent layer

This directory is the **only editable source** for QA-AI-STLC's agent layer (development plan
section 2, layer 3; AGENTS.md section 3). Everything host-specific — the Claude Code plugin, the
Codex plugin, the VS Code extension under `adapters/*` — is generated from this directory and
`plugin.config.ts` later (P2-11 and beyond). Never hand-edit an adapter tree to work around a gap
here; fix the format or the content in `agents/` instead.

This file documents the _format_ every skill, hub definition, spoke contract and phase prompt
follows. It does not contain shipped agent content: see [What exists today](#what-exists-today).

## Directory layout

```
agents/
├── README.md              # this file
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md        # required: frontmatter + short body, ~200 lines
│       └── references/     # optional: detail specific to this skill, no line limit
│           └── *.md
├── hub/
│   └── HUB.md              # the hub agent's responsibilities and dispatch contract
├── phase-prompts/
│   └── <phase>.md          # one short prompt per PHASES entry (packages/core/src/phases.ts)
└── references/
    └── *.md                # background shared by more than one skill (see below)
```

`<skill-name>` and `<phase>` are kebab-case (AGENTS.md 7.1). A skill directory holds exactly one
`SKILL.md`; detail specific to that one skill lives under its own `references/`, so a skill stays
relocatable and a reviewer can see its whole footprint in one directory.

Detail more than one skill needs — domain background, not tool mechanics — lives instead under the
top-level `agents/references/`, so it is written once and pointed to by name rather than copied
into every skill that needs it (P2-17's `testing-standards.md` is the first example: test-design
technique names, the `TestCaseSchema`/`DefectDraftSchema` field conventions, and the regression-tier
definitions that `qa-design-cases`, `qa-execute` and `qa-generate-tests` all rely on). A skill still
lists it under its own `references:` frontmatter entry so the file-existence check in
[Frontmatter](#frontmatter) covers it the same way as a skill-local file.

## `SKILL.md` format

Cross-reference: AGENTS.md 12.2 states the rules ("Use when ..." trigger descriptions, no
"what this is" prose, ~200-line cap, `references/` for detail, no duplicated engine logic, every
skill needs triggering evals). This section only fixes the concrete file shape those rules apply
to.

### Frontmatter

```yaml
---
name: kebab-case-matching-the-directory
description: >-
  Use when <concrete trigger phrase or situation>. Use when <another one>. Never use for
  <the nearest thing this is not>.
triggers:
  - 'a realistic phrase that should fire this skill'
  - 'another one'
nonTriggers:
  - 'a realistic phrase that must NOT fire this skill'
references:
  - references/some-detail.md
---
```

- `name` matches the containing directory exactly.
- `description` is the single field a host uses to decide whether to load the skill. It states
  _when_ to use the skill with concrete trigger phrases (AGENTS.md 12.2), never a summary of what
  the skill does.
- `triggers` / `nonTriggers` are example phrases for the triggering-eval harness (P2-10). They are
  data for that future eval runner, not documentation for a human reader — keep them short and
  realistic rather than exhaustive. A skill with no plausible non-trigger example is a sign its
  `description` is too broad.
- `references` lists the files under `references/` the body links to, so a lint or an eval can
  confirm every reference actually exists without parsing prose links.

### Body

Plain Markdown after the frontmatter. Conventions, not a rigid template:

1. A one-line restatement of the trigger, for a human skimming the file.
2. What engine tool(s) the skill calls (MCP tool names, `qa.*`) and how to interpret the
   structured result. A skill never re-implements engine logic or duplicates a file format the
   engine already owns (AGENTS.md 12.2) — it calls the tool and reacts to the result.
3. What to hand off to `references/*.md` when the detail is only needed occasionally: field-level
   schemas, edge cases, examples. Keep the main body to the common path.

No "you must" prose for anything the engine already enforces — phase order, gate approval,
evidence registration are state-machine behavior, not skill instructions (AGENTS.md 12.1). A skill
describes what to call and how to read the result, not an obligation the engine would refuse
anyway.

### The ~200-line cap

`SKILL.md` stays under **200 lines**, counting the frontmatter (AGENTS.md 12.2's "under ~200
lines" is fixed here at an exact, lintable number). `scripts/lint-agents.mjs` walks
`agents/skills/**/SKILL.md` and fails the build on any file over the limit; see
[Lint for size](#lint-for-size). Files under `references/` have no line limit — that is precisely
what they exist for.

## Hub definition

`agents/hub/HUB.md` is the single hub agent definition (development plan section 5.1). There is
one hub, not one per skill, so there is one file, not a `hub/<name>/` tree. It documents:

- What the hub owns: pipeline state and the only channel to the operator.
- How it dispatches a spoke: a narrow task, minimal context, no shared spoke-to-spoke state.
- How it validates a spoke's response against that spoke's payload schema, and what it does on
  failure (re-dispatch with the validator's error, up to `config.yaml`'s `agents.retries`).

The hub definition is prose plus references to engine tools and to the spoke contract below; it
carries no Zod schema of its own. Host-specific wiring (a Claude Code subagent's `model:` field, a
Codex sequential loop) is generated from this file later (P2-11+), not duplicated into it.

## Spoke contract

The generic envelope every spoke result flows through is a Zod schema in `packages/schemas`, not
in `agents/`, because it is data crossing the engine/agent boundary and `packages/schemas` is that
boundary's contract for every artifact (AGENTS.md section 3; development plan section 3.1):

- `packages/schemas/src/spoke.ts` exports `SpokeResultSchema` (a `status: 'ok' | 'error'`
  discriminated union), `SpokeErrorSchema` and `SpokeValidationIssueSchema`.
- `SpokeResultSchema` is generic: it carries an untyped `payload` on `status: 'ok'`. A concrete
  spoke type (the explorer's page spoke, a test-design spoke, and so on) additionally validates
  that `payload` against its own task-specific payload schema, added when the task that implements
  that spoke lands (P3-05 and later) — this issue defines the envelope only, not those payloads.
- A per-spoke-type definition file (what task the spoke gets, what payload schema its result must
  satisfy) is added under `agents/` alongside the task that implements it, following the same
  kebab-case, minimal-context convention as a skill. No such file exists yet.

## Phase prompts

`agents/phase-prompts/<phase>.md` holds one short prompt per entry in `PHASES`
(`packages/core/src/phases.ts` — currently `scope` and `cases`; a later phase adds to that tuple
and gains a matching prompt file here, never the reverse). Each file is a few lines: what the hub
is doing during that phase and which `qa.*` tools it calls to do it. This is a dispatch reference
for the hub, not skill content — a phase prompt names the tools and the gate; the skill that
actually carries out the phase's work is a separate, longer file under `skills/`.

## Lint for size

`scripts/lint-agents.mjs` enforces the `SKILL.md` line cap:

```sh
node scripts/lint-agents.mjs
```

It walks `agents/skills/**/SKILL.md`, counts lines, and exits `1` naming every file over 200 lines
(and exits `0` with a short confirmation otherwise). It is chained into the root `lint` script
(`package.json`) the same way `scripts/check-llm-denylist.mjs` is, so an oversized skill fails
`npm run lint` the same way a denied dependency does.

## What exists today

- `agents/skills/_example/SKILL.md` is a **template, not a shipped skill** — its frontmatter says
  so explicitly. It demonstrates the frontmatter fields, the "Use when ..." phrasing, a
  `references/` file and the line budget. The real skills this format was built for (`qa-start`,
  `qa-explore`, `qa-design-cases`, and the rest of the locked ten-skill list) are P2-09 and later,
  not this issue.
- `agents/hub/HUB.md` is the real hub definition.
- `agents/phase-prompts/scope.md` and `agents/phase-prompts/cases.md` are the real phase prompts
  for the two phases the state machine currently implements.
- `agents/references/testing-standards.md` (P2-17) is the first shared reference: test-design
  technique names, `TestCaseSchema`/`DefectDraftSchema` field conventions, and the regression-tier
  definitions. No skill points to it by its `references:` frontmatter entry yet, because no skill
  exists yet (P2-09 is the first one that will).
