# Roadmap

QA-AI-STLC is built in phases. Each phase ends with an end-to-end scenario on the demo application and on at least one real open-source application.

Live task status is on the [project board](https://github.com/users/Klim-101/projects/2) and in [milestones](https://github.com/Klim-101/QA-AI-STLC/milestones). The progress table below is updated automatically from the milestones; do not edit it by hand.

<!-- roadmap:progress:start -->

| Phase                                                | Status      | Progress |
| ---------------------------------------------------- | ----------- | -------- |
| Phase 0 — Foundation                                 | done        | 18 / 18  |
| Phase 1 — Explorer 0.1                               | done        | 20 / 20  |
| Phase 2 — MCP and Claude Code plugin                 | in progress | 11 / 21  |
| Phase 3 — Runner and generation                      | planned     | 0 / 16   |
| Phase 4 — Hub-and-spoke                              | planned     | 0 / 11   |
| Phase 5 — Codex                                      | planned     | 0 / 6    |
| Phase 6 — API, accessibility, defects, RCA, security | planned     | 0 / 18   |
| Phase 7 — Release 1.0                                | planned     | 0 / 10   |

_Last synchronized: 2026-09-22._
<!-- roadmap:progress:end -->

## Phase 0 — Foundation

The project skeleton everything else depends on.

- Monorepo with strict TypeScript and CI on Windows, macOS and Linux
- Licence, community files and contribution rules
- Architecture decision records
- Versioned artifact schemas
- Demo application with a catalogue of known bugs

## Phase 1 — Explorer 0.1

First usable release, published on npm.

- `qa init` with a testing scope survey: you decide, per project, whether Web E2E, API, accessibility and security testing are in scope
- Safe-mode crawler with a domain allowlist
- Sign-in by attaching to a browser you are already logged into
- Static analysis of React, Angular and Vue sources
- Pick mode: build a selector registry by clicking elements
- Locator synthesis with stability scoring
- Generated, typed locator module for Playwright
- `qa explore --verify` to catch selector drift in CI
- "Missing test ID" report for developers

## Phase 2 — MCP server and Claude Code plugin

The agent can drive the engine inside Claude Code.

- Local MCP server with typed tools
- Browser tools that register every action as evidence
- Scope and test case design with approval gates bound to artifact hashes, one case set per in-scope testing type; every case classified by regression tier
- Claude Code plugin generated from one canonical source

## Phase 3 — Runner and generation

Generated tests you can keep and run without a model.

- Playwright runner with honest result statuses
- Live, interactive execution of an approved test case before any code is generated — a headed browser for the web, a real call for API, an axe-core scan for accessibility — so a problem is visible the moment it happens, and works even where no stable locator exists yet
- Test generation verified by execution before it is kept
- Reports and a requirement-to-evidence traceability matrix
- Linking existing hand-written tests into traceability

## Phase 4 — Hub-and-spoke

Parallel work where it pays off, measured rather than assumed.

- Parallel subagents in Claude Code with budgets
- Failure triage and independent reviewer agents
- Regression suite selection by test priority, replayed through the generated tests or live execution as needed
- Run metrics — how a run was carried out, not how much it cost to think
- Agent-layer evaluation set and a sequential versus parallel comparison

## Phase 5 — Codex

The same framework inside Codex.

- Codex plugin generated from the same source
- Verified flow in Codex CLI and desktop

## Phase 6 — API, accessibility, defects, RCA and security

- API-surface discovery from real traffic, OpenAPI diff and draft synthesis
- API tests generated from your OpenAPI contract as Playwright request specs, verified by execution like the UI tests
- Accessibility runner (axe-core)
- Tracker-neutral defect drafts with an acceptance gate, ready for you to file with your own tools
- Root cause analysis for every accepted defect, with facts separated from hypotheses and its own review gate
- On-demand security audit, outside the regular pipeline: non-destructive black-box checks, plus code-assisted checks when you point the framework at the application's source

## Phase 7 — Release 1.0

- `qa upgrade` for schema migrations and regeneration that preserves manual edits
- Documentation site with a five-minute quick start
- Public benchmark on the demo application
- Submissions to the Claude Code and Codex plugin directories

## Not planned

These are deliberate boundaries, not gaps. See the responsibility boundary in the [README](../../README.md).

- Calling language models directly or running hosted infrastructure
- Publishing defects or reports to Jira, Confluence, GitHub Issues or other trackers
- Bundling third-party MCP servers
