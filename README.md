# QA-AI-STLC

Open-source, model-agnostic QA framework that runs inside the agent host you already use: Claude Code or Codex.

> **Status: pre-alpha.** The engine packages (`schemas`, `core`, `explorer`, `cli`) are published to npm and covered by tests, and the explorer's crawler, static source analysis, locator synthesis, selector registry and reports already run against real source and a real browser (see the example below). They are not yet wired into one `qa explore` command, and there is no agent-host plugin or MCP server yet — see the [roadmap](docs/public/ROADMAP.md) for what that leaves planned.

## Why

QA work with AI agents today mostly means chatting with a model in a loop: it clicks around, writes a test, tells you it passed. There's no artifact you can trust without re-checking it yourself, no record of what was actually clicked or called, and no way to tell "the agent verified this" from "the agent said this." Every project starts over — no shared selector map, no traceability from requirement to evidence, no memory between runs.

QA-AI-STLC turns that into a deterministic pipeline instead of a conversation. The agent drives it, but the engine — not the model — owns the browser, the test runs, the evidence, and every report. A test isn't "kept" until it has actually executed. A defect draft isn't written by hand. Nothing is marked passed unless the engine, not the agent's word, says so. And because it runs inside the agent host you already have, on your own subscription, there's no separate service to trust, host, or pay for.

## What it does

- **Asks what is in scope** for the project: Web E2E, API, accessibility and security testing are each decided by you, and the pipeline enforces the answer.
- **Explores your application** and builds a stable selector registry and an API-surface map before any test is written.
- **Designs test cases** with the agent in your host, behind approval gates you control.
- **Generates Playwright tests**, for the UI and for the API from your OpenAPI contract, that are verified by execution before they are kept and run in CI without any model.
- **Records evidence** (screenshots, traces, redacted network data) that only the engine can create, so results cannot be invented.
- **Prepares defect drafts** in a tracker-neutral format for you to file, and a root cause analysis for every defect you accept.
- **Runs a security audit on demand**: non-destructive checks against the running application, and code-assisted checks when you point it at the source.

A deterministic TypeScript engine does the work that must be reliable. A thin layer of skills lets the agent in your host drive it.

## Supported hosts

| Host                          | Status                                     |
| ----------------------------- | ------------------------------------------ |
| Claude Code (CLI and desktop) | Planned first                              |
| Codex (CLI and desktop)       | Planned                                    |
| Other MCP-capable hosts       | Engine usable through the local MCP server |

## Responsibility boundary

Read this before adopting the framework.

**The model is yours.** The framework runs entirely on your machine inside your agent host and uses the model and subscription you have configured there. It operates no hosted service, requires no API keys and never calls a language model itself. Model usage and its cost are governed by your host account.

**Defects and reports are yours to publish.** Creating, filing and publishing defects, test reports and any other records in external systems such as Jira, Confluence, GitHub Issues, Azure DevOps or TestRail is the responsibility of the operator and the operator's infrastructure. The framework contains no integrations with such systems, stores no tracker credentials and sends nothing to them. It produces schema-valid defect drafts and rendered reports in your project that you can file, script or import with your own tools.

**Decisions are yours.** Test scope, test cases, defect acceptance and release recommendations require explicit operator approval. The framework records evidence; it does not certify quality.

**Environments are yours to choose.** Point the framework only at non-production environments you are authorized to test. Safe mode is on by default, but you remain responsible for the data and systems it touches.

## Quick start

```sh
npx @qa-ai-stlc/cli init     # creates .qa/ and a starting config.yaml
npx @qa-ai-stlc/cli doctor   # checks Node, browsers, identities and reachability
```

Everything the framework creates in your project lives in `.qa/`, plus generated tests in `tests/qa/`. `qa explore` — the command that ties crawling, static analysis and the selector registry together — and the Claude Code / Codex plugins are still planned; see the [roadmap](docs/public/ROADMAP.md).

## Example: what static analysis produces today

The explorer's static source analysis and reporting run today as library functions (`@qa-ai-stlc/explorer`), ahead of the `qa explore` command that will wire them into the CLI. Given two real, unmodified views from [`examples/demo-app`](examples/demo-app) — a login form and a "new task" form, neither with a `data-testid` on any field (a deliberately catalogued gap) — this is the actual, unedited output:

```ts
import { analyzeStaticSource, buildMissingTestIdReport, renderMissingTestIdReportMarkdown } from '@qa-ai-stlc/explorer';

const { elements } = analyzeStaticSource({ files: [
  { filePath: 'examples/demo-app/src/views/login.ejs', content: /* ... */ },
  { filePath: 'examples/demo-app/src/views/tasks-new.ejs', content: /* ... */ },
] });

const report = buildMissingTestIdReport({ schemaVersion: 1, generatedAt: new Date().toISOString(), elements });
console.log(renderMissingTestIdReportMarkdown(report));
```

```md
# Missing test ID report

_Generated 2026-09-18T12:00:00.000Z — 8 element(s) with no test ID._

## examples/demo-app/src/views/login.ejs

- input `input16` (static) — line 16
- input `input20` (static) — line 20
- button `button21` (static) — line 21

## examples/demo-app/src/views/tasks-new.ejs

- input `input13` (static) — line 13
- input `input15` (static) — line 15
- select `select17` (static) — line 17
- input `input23` (static) — line 23
- button `button24` (static) — line 24
```

Every field the scanner cannot name from a `data-testid`, `aria-label` or `role` falls back to a `tag:line` name — itself a hint that the field would benefit from one. Once every element does carry a test ID, `renderMissingTestIdReportMarkdown` reports a clean bill of health instead.

## Documentation

- [Roadmap](docs/public/ROADMAP.md): phases, current status, and what is deliberately out of scope.
- [Architecture decision records](docs/adr/README.md): the significant, hard-to-reverse decisions behind the design, and why.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

Licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE).

The software is provided "AS IS", without warranties or conditions of any kind. Claude Code, Codex and Playwright are trademarks of their respective owners; this project is not affiliated with or endorsed by them.
