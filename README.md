# QA-AI-STLC

Open-source, model-agnostic QA framework that runs inside the agent host you already use: Claude Code or Codex.

> **Status: pre-alpha.** The repository is being bootstrapped. No package is published yet, and the commands below describe the planned interface.

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

## Quick start (planned)

```sh
# Claude Code: install the plugin from the marketplace, then in a session:
/qa start

# CLI, for deterministic steps and CI:
npx @qa-ai-stlc/cli init
npx @qa-ai-stlc/cli doctor
npx @qa-ai-stlc/cli explore
```

Everything the framework creates in your project lives in `.qa/`, plus generated tests in `tests/qa/`.

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
