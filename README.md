# QA-AI-STLC

Open-source, model-agnostic QA framework that runs inside the agent host you already use: Claude Code or Codex.

> **Status: alpha.** The engine packages are published to npm and covered by tests on Windows, macOS
> and Linux, and the Claude Code plugin installs from this repository. Progress per phase is in the
> [roadmap](docs/public/ROADMAP.md); Codex support is planned. This README describes `main`: fixes
> merged since the last release are listed under `.changeset/` and reach npm with the next one. To
> try `main` itself, build from source (`npm ci && npm run build`).

## Why

QA work with AI agents today mostly means chatting with a model in a loop: it clicks around, writes a test, tells you it passed. There's no artifact you can trust without re-checking it yourself, no record of what was actually clicked or called, and no way to tell "the agent verified this" from "the agent said this." Every project starts over — no shared selector map, no traceability from requirement to evidence, no memory between runs.

QA-AI-STLC turns that into a deterministic pipeline instead of a conversation. The agent drives it, but the engine — not the model — owns the browser, the test runs, the evidence, and every report. A test isn't "kept" until it has actually executed. A defect draft isn't written by hand. Nothing is marked passed unless the engine, not the agent's word, says so. And because it runs inside the agent host you already have, on your own subscription, there's no separate service to trust, host, or pay for.

## What it does

A deterministic TypeScript engine does the work that must be reliable; a thin layer of skills lets
the agent in your host drive it.

- **Scope you decide.** Web E2E, API, accessibility and security testing are each in or out of scope per project, and the pipeline enforces the answer.
- **Exploration.** A safe-mode crawl, optional static source analysis and a manual pick mode build a selector registry with scored locators and an API-surface map, and `qa explore --verify` catches a selector that stopped working.
- **Requirements and test cases.** Requirements come from a local Markdown source; every case must link to a real requirement and can declare expectations the engine checks.
- **Hash-bound approvals.** Scope, cases, accepted defects, root cause analyses and security audits are approved against their exact content, so an edit afterwards reopens the approval.
- **Live execution.** An approved case runs live, in a browser, as an HTTP call or as an axe-core scan, before any code is written; a result is `passed` only when the recorded evidence proves it.
- **Verified generation.** Playwright UI specs and API specs from your OpenAPI contract are kept only after they typecheck, run against the application and cover the case's own steps.
- **Runs and evidence.** `qa run` runs E2E, API and accessibility specs and records each result with hashed, secret-scanned evidence, and honest statuses such as `partial`.
- **Reports.** Run summaries and a requirement → case → result → evidence traceability matrix as Markdown or HTML, plus a per-criterion WCAG conformance section.
- **Defects, triage and RCA.** Failures are classified, product bugs become tracker-neutral defect drafts for you to file, and an accepted defect can get a root cause analysis.
- **Security audit on demand.** Non-destructive checks, run only after an authorization you approve, never as part of the pipeline.
- **Adapts to your application.** Layered configuration, named API auth profiles (including a token read from the live browser session), Kendo UI for jQuery and Angular widgets, and a pinned browser language.
- **Same engine over MCP.** The local `qa-mcp-server` exposes one tool per engine operation, so any MCP-capable host gets the same results as the CLI.

## Supported hosts

| Host                          | Status                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Claude Code (CLI and desktop) | Installable from this repository as a public marketplace, or from a local marketplace (verified on Windows and macOS) |
| Codex (CLI and desktop)       | Planned                                                                                                               |
| Other MCP-capable hosts       | Engine usable through the local MCP server                                                                            |

## Responsibility boundary

Read this before adopting the framework.

**The model is yours.** The framework runs entirely on your machine inside your agent host and uses the model and subscription you have configured there. It operates no hosted service, requires no API keys and never calls a language model itself. Model usage and its cost are governed by your host account.

**Defects and reports are yours to publish.** Creating, filing and publishing defects, test reports and any other records in external systems such as Jira, Confluence, GitHub Issues, Azure DevOps or TestRail is the responsibility of the operator and the operator's infrastructure. The framework contains no integrations with such systems, stores no tracker credentials and sends nothing to them. It produces schema-valid defect drafts and rendered reports in your project that you can file, script or import with your own tools. See [Filing defect drafts with your own tooling](docs/public/filing-defect-drafts.md) for worked examples.

**Decisions are yours.** Test scope, test cases, defect acceptance and release recommendations require explicit operator approval. The framework records evidence; it does not certify quality.

**Environments are yours to choose.** Point the framework only at non-production environments you are authorized to test. Safe mode is on by default, but you remain responsible for the data and systems it touches.

## Quick start

The full walkthrough, from prerequisites to a first run on the demo app, is in
[How to install and run](docs/public/how-to-install-and-run.md).

In Claude Code, install the plugin:

```sh
claude plugin marketplace add Klim-101/QA-AI-STLC
claude plugin install qa-ai-stlc@qa-ai-stlc
```

then ask: "set up QA-AI-STLC for this repo". The `qa-start` skill asks which kinds of testing are in
scope, writes `.qa/config.yaml` through the engine, offers to add an environment and an identity (you
name a `QA_*` variable and set its value yourself) and checks the setup with `qa.doctor`.

For CI or a shell, the CLI does the same with flags:

```sh
npx @qa-ai-stlc/cli init --e2e in-scope --api out-of-scope --a11y out-of-scope --security out-of-scope
npx @qa-ai-stlc/cli config add environment staging \
  --base-url https://staging.example.com/dashboard --allowlist staging.example.com
npx @qa-ai-stlc/cli config add identity admin \
  --auth storage-state --secret QA_ADMIN_PASSWORD \
  --login-url https://staging.example.com/login --username admin@example.com
npx @qa-ai-stlc/cli explore --environment staging --identity admin
```

Against [`examples/demo-app`](examples/demo-app), a small task tracker with catalogued bugs:

```
Wrote selectors/registry.json: 78 element(s) (78 added, 0 removed, 0 degraded).
0 element(s) with no locator candidate.
0 request(s) blocked by safe mode.
```

Every command takes `--json`, and `qa status` names what to do next. For applications that do not
fit the defaults (a session opened with a POST, an API on another port, several environments, a
multilingual UI, controls in collapsed panels), see
[Configuring and exploring](docs/public/configuring-and-exploring.md).

## What it looks like

![qa explore --verify catching a stale selector, from a real run against examples/demo-app](docs/public/media/qa-explore-demo.svg)

Recorded from a real run against the demo app: `qa explore` builds the registry, a teammate renames a
`data-testid` on the live page, and `qa explore --verify` catches it and exits non-zero.

Everything the framework creates lives in `.qa/`, as canonical JSON, plus a generated locator module
that generated tests use by name instead of literal selectors:

```json
{
  "elementId": "0c39ce7809e90e508adfaa7caaab21befc7adbacf20bf7b87facd333326c0861",
  "name": "dashboard",
  "kind": "link",
  "locatorCandidates": [
    { "strategy": "role", "value": "{\"role\":\"link\",\"name\":\"Dashboard\"}", "fragile": false },
    { "strategy": "text", "value": "Dashboard", "fragile": false },
    { "strategy": "css", "value": "a:nth-of-type(1)", "fragile": true }
  ],
  "stabilityScore": 1,
  "source": "crawl",
  "pageUrl": "http://localhost:4310/dashboard"
}
```

```ts
export function apply(page: Page): Locator {
  return page.getByTestId('apply-filter');
}
```

Requirements, cases and approvals are checked the same way:

![qa validate catching a gate reopened by a hand-edited artifact and a test case whose requirement disappeared, from a real run](docs/public/media/qa-pipeline-demo.svg)

`qa approve` hashes an artifact's exact content into an append-only ledger
([ADR-0003](docs/adr/0003-hash-bound-approval-gates.md)), and `qa validate` recomputes every gate from it, so a hand edit
after approval reopens the gate and a case whose requirement disappeared is reported as unlinked.

## Tested on real applications

Besides the demo app, the whole chain (explore, case design, live execution, triage, defects, root
cause analysis, generation, `qa run` and the report) has been driven by a real agent host through the
Claude Code plugin, over several iterations, against two applications that are not ours:

- a live, sign-in protected Kendo UI for Angular application;
- the public sample shop [Practice Software Testing](https://practicesoftwaretesting.com/), end to
  end for web E2E, API (from its OpenAPI contract) and accessibility cases, from the first
  exploration to generated specs replayed with `qa run` without any agent or model.

The bugs each iteration found were fixed before the next. This is a statement about the runs made
so far, not a guarantee for your application; report what you find.

## Documentation

- [Roadmap](docs/public/ROADMAP.md): phases, current status, and what is deliberately out of scope.
- [How to install and run](docs/public/how-to-install-and-run.md): prerequisites, the Claude Code plugin, the CLI, the local MCP server and a first run on the demo app.
- [Configuring and exploring](docs/public/configuring-and-exploring.md): configuration layers and recipes for applications that do not fit the defaults.
- [CI usage](docs/public/ci-usage.md): the deterministic, no-model pipeline (`qa explore --verify`, `qa link`, `qa run`, `qa validate`) as a copy-pasteable recipe.
- [Filing defect drafts](docs/public/filing-defect-drafts.md): how to turn an accepted draft into a tracker issue with your own tooling.
- [Architecture diagram](docs/public/architecture-diagram.md): how the agent host, the engine and the pipeline state fit together.
- [Architecture decision records](docs/adr/README.md): the significant, hard-to-reverse decisions behind the design.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Questions, ideas and general feedback belong in [Discussions](https://github.com/Klim-101/QA-AI-STLC/discussions); if you've installed the plugin, [Show and tell](https://github.com/Klim-101/QA-AI-STLC/discussions/categories/show-and-tell) is the place to say how it went. A specific bug or requested feature is an [issue](https://github.com/Klim-101/QA-AI-STLC/issues/new/choose).

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

Licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE).

The software is provided "AS IS", without warranties or conditions of any kind. Claude Code, Codex and Playwright are trademarks of their respective owners; this project is not affiliated with or endorsed by them.
