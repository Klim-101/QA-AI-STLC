# How to install and run QA-AI-STLC

This guide takes you from nothing to a first `qa explore` against a running application. It covers
three ways to use the framework and a way to try it without any application of your own.

| You want to...                                       | Use                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| Work with an agent (skills drive the engine for you) | [Claude Code plugin](#option-a-claude-code-plugin)           |
| Run the engine from a shell or CI, with no agent     | [CLI](#option-b-the-cli-for-a-shell-or-ci)                   |
| Use the engine from another MCP-capable agent host   | [Local MCP server](#option-c-the-local-mcp-server)           |
| Try it first, or work on the framework itself        | [Demo app and building from source](#try-it-on-the-demo-app) |

The framework runs entirely on your machine. It makes no model calls, needs no API key and talks to
no hosted service; the model comes from your agent host and your own subscription. Read the
[responsibility boundary](../../README.md#responsibility-boundary) before pointing it at an
environment.

## Prerequisites

- **Node.js 22.12 or newer** (the repository's CI uses Node 24). Check with `node --version`.
  npm ships with Node.
- **A browser binary for Playwright.** The engine drives Chromium (Firefox and WebKit are
  optional). The binaries are not bundled with the packages; see [Install browsers](#install-browsers).
- **A running application you are allowed to test.** Use a non-production environment. Safe mode is
  on by default (no form submission, no non-`GET` requests), but you stay responsible for the
  data and systems you point it at.
- **Claude Code**, only for Option A. Codex support is planned and not available yet.

Windows, macOS and Linux are supported. The shell snippets below use `sh` syntax; on PowerShell,
replace a trailing `\` with a backtick and set variables with `$env:NAME = 'value'`.

## Option A: Claude Code plugin

This repository is itself a Claude Code marketplace, so there is nothing to clone.

```sh
claude plugin marketplace add Klim-101/QA-AI-STLC
claude plugin install qa-ai-stlc@qa-ai-stlc
```

The plugin brings seven skills (`qa-start`, `qa-explore`, `qa-design-cases`, `qa-execute`,
`qa-generate-tests`, `qa-report`, `qa-rca`), a hook that blocks hand edits under `.qa/`, and a local
MCP server that it launches through `npx -y @qa-ai-stlc/mcp-server@<pinned version>`. The first
launch downloads that package, so it needs network access to npm.

Then, in the project you want to test, open Claude Code and say:

> set up QA-AI-STLC for this repo

The `qa-start` skill states the project root it will use, asks whether Web E2E, API, accessibility
and security testing are in scope, writes `.qa/config.yaml` through the engine, offers to add an
environment and an identity, and runs `qa.doctor`. No terminal command is needed.

From there, ask for what you want in plain words and the matching skill takes over:

| Say something like                                | Skill               |
| ------------------------------------------------- | ------------------- |
| "explore the app", "update the registry"          | `qa-explore`        |
| "design test cases for the checkout flow"         | `qa-design-cases`   |
| "execute the login case"                          | `qa-execute`        |
| "generate the test for the login case"            | `qa-generate-tests` |
| "what's the status of the last run"               | `qa-report`         |
| "do a root cause analysis for defect login-error" | `qa-rca`            |

Phase order and approvals are enforced by the engine, not by the skills, so the agent cannot skip a
gate. If the plugin's MCP server does not connect, see [Troubleshooting](#troubleshooting).

## Option B: the CLI, for a shell or CI

Work in the directory that should own the `.qa/` folder, usually next to the application's own
repository or in a separate test project.

```sh
mkdir my-app-qa && cd my-app-qa
npm init -y
npm install --save-dev @qa-ai-stlc/cli
npx qa --version
```

`npx @qa-ai-stlc/cli <command>` works without installing, but downloads the package on every call.
The examples below use `npx qa`.

### Install browsers

```sh
npx qa doctor --fix
```

`qa doctor` checks Node, installed browsers, identities and environment reachability. With `--fix`
it installs missing browsers through Playwright's own installer. Running Playwright's installer
yourself works too: `npx playwright install chromium`.

### 1. Initialise the project

`qa init` has no interactive prompts. Each of Web E2E, API, accessibility and security testing must
be given as `in-scope` or `out-of-scope`:

```sh
npx qa init --e2e in-scope --api out-of-scope --a11y out-of-scope --security out-of-scope
```

Without those flags the command fails with `INIT_SCOPE_UNDECIDED`. To decide later, pass
`--defer-scope` and change a decision afterwards with `npx qa config set testing.<type> <value>`.

Some in-scope choices need an extra flag in the same call:

- `--api in-scope` requires `--api-source <path-or-url | discover | synthesize>`.
- Code-assisted security checks, or an API contract kept as a local file, need
  `--source-path <relative path to the application's checkout>`.
- `--a11y in-scope` accepts `--a11y-wcag-version` (2.0, 2.1 or 2.2) and `--a11y-level` (A, AA or
  AAA). The default is WCAG 2.1 AA.
- `--component-library` (`none`, `kendo-jquery` or `kendo-angular`) records the UI library of the
  application under test.

Everything the framework creates lives in `.qa/`, plus a generated locator module in
`tests/qa/locators.ts`. Commit `.qa/config.yaml`; `qa init` already git-ignores the local layer.

### 2. Describe the application

An environment names the application and the hosts the engine may reach. An identity is a way of
signing in:

```sh
npx qa config add environment staging \
  --base-url https://staging.example.com/dashboard --allowlist staging.example.com

npx qa config add identity admin \
  --auth storage-state --secret QA_ADMIN_PASSWORD \
  --login-url https://staging.example.com/login --username admin@example.com
```

`--secret` is the **name** of an environment variable, never the password. Set the value yourself,
in the shell that runs the command:

```sh
export QA_ADMIN_PASSWORD='...'          # PowerShell: $env:QA_ADMIN_PASSWORD = '...'
```

Both commands validate against the schema before writing, and refuse to overwrite an existing name
unless you pass `--force`. Use `--auth cdp-attach` instead to reuse an already signed-in browser
session.

Check that everything resolves:

```sh
npx qa doctor
```

Expect a `PASS` line for the browser, the identity and the environment.

### 3. Explore, then build on the registry

```sh
npx qa explore --environment staging --identity admin
```

This crawls the application, synthesises locators and writes `selectors/registry.json`. The output
reports how many elements were added, how many have no locator candidate, and how many non-`GET`
requests safe mode blocked. Add `--json` to any command for machine-readable output.

Later runs of the same command refresh the registry. To check that stored selectors still resolve on
the live page, without re-crawling:

```sh
npx qa explore --environment staging --identity admin --verify
```

It exits non-zero when a selector has degraded, so it works as a CI gate.

A typical path after exploring:

```sh
npx qa scope --from file --path requirements.md      # requirements, one "## Heading" each
npx qa cases add --path cases/login.json             # a case linked to a real requirement
npx qa approve scope --artifact artifacts/scope.json --approved-by <your name>
npx qa validate                                      # recomputes every gate from the ledger
npx qa run --spec tests/login.playwright-spec.ts     # records results under .qa/runs/<run-id>/
npx qa report                                        # run summary and traceability matrix
npx qa status                                        # names what to do next
```

Designing cases with a model, proving them live and generating specs are agent work (Option A or
C). The CLI covers the deterministic parts. For a complete CI recipe, see [CI usage](ci-usage.md).

### Configuration layers

`.qa/config.yaml` is committed. An optional `.qa/config.local.yaml` (or the file named by
`QA_CONFIG_LOCAL`) lets one machine point at its own server, identity or source checkout. Only
`environments`, `identities`, `source` and `agents` can be set locally. If the local layer widens an
allowlist, every command prints a warning naming what changed. `npx qa config show --explain`
prints the effective configuration and where each value came from.

## Option C: the local MCP server

Any agent host that can launch a local stdio MCP server can drive the same engine the CLI uses:

```sh
npx -y @qa-ai-stlc/mcp-server
```

The binary is `qa-mcp-server`. It listens on stdio only: no port, no Docker, no process that
outlives the session. Register it in your host as a stdio server with command `npx` and arguments
`-y @qa-ai-stlc/mcp-server`; see your host's documentation for where that configuration lives. Each
engine operation is one `qa.*` tool, for example `qa.doctor`, `qa.explore`, `qa.scope` and
`qa.run`.

Skills are only packaged for Claude Code today. With another host you get the tools but not the
skills that tell the agent how to use them.

## Try it on the demo app

[`examples/demo-app`](../../examples/demo-app) is a small task tracker with catalogued bugs, used to
validate the explorer and runners. It needs the repository, so this is also the path for working on
the framework itself.

```sh
git clone https://github.com/Klim-101/QA-AI-STLC.git
cd QA-AI-STLC
npm ci
npm run build
npm run demo
```

The app listens on `http://localhost:4310` (override with `DEMO_APP_PORT`). Sign in with
`admin@example.com` / `admin123` or `employee@example.com` / `employee123`.

In a second terminal, in a **separate empty directory** (not inside the checkout), run the built CLI
straight from the clone. Replace `<clone>` with the path of the repository:

```sh
node <clone>/packages/cli/dist/bin/qa.js init \
  --e2e in-scope --api out-of-scope --a11y out-of-scope --security out-of-scope
node <clone>/packages/cli/dist/bin/qa.js doctor --fix
node <clone>/packages/cli/dist/bin/qa.js config add environment demo \
  --base-url http://localhost:4310 --allowlist localhost
node <clone>/packages/cli/dist/bin/qa.js config add identity admin \
  --auth storage-state --secret QA_DEMO_ADMIN_PASSWORD \
  --login-url http://localhost:4310/login --username admin@example.com
export QA_DEMO_ADMIN_PASSWORD='admin123'
node <clone>/packages/cli/dist/bin/qa.js explore --environment demo --identity admin
```

You should see a line like `Wrote selectors/registry.json: 78 element(s) ...`. The demo's sign-in
credentials are published and fake; never reuse this pattern for real secrets.

### Working on the framework

Contributors run the full local gate before a pull request:

```sh
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run lint:generated
npm run licenses:check
```

`npm run generate` rebuilds the Claude Code plugin and the rules under `adapters/` and
`.claude/rules/`; those trees are generated, never edited by hand. Branch, commit and pull request
rules are in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Troubleshooting

| Symptom                                                  | Likely cause and fix                                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `INIT_SCOPE_UNDECIDED`                                   | `qa init` needs all four scope flags. Pass `in-scope` or `out-of-scope` for each, or add `--defer-scope`.                                                                                        |
| `qa doctor` reports a browser as not installed           | Run `npx qa doctor --fix` or `npx playwright install chromium`.                                                                                                                                  |
| `qa doctor` reports an environment as unreachable        | Start the application, check the URL, and connect to your VPN first if the environment is behind one.                                                                                            |
| Identity check fails on a missing secret                 | The variable named by `--secret` is not set in the shell that runs the command. Set it, then re-run.                                                                                             |
| `page.fill` times out on the login form                  | The sign-in form does not match the engine's default selectors. Use pick mode (`qa explore --pick <login-url>`) to find them, then add them as `selectors` on the identity in `.qa/config.yaml`. |
| An application never gets past its sign-in page          | It may open its session with a `POST`, which safe mode blocks. See [Applications that open their session with a POST](../../README.md#applications-that-open-their-session-with-a-post).         |
| The self-signed certificate of a test server is rejected | The target needs a certificate the operating system and Node already trust.                                                                                                                      |
| The plugin's MCP server does not connect or times out    | The first launch downloads `@qa-ai-stlc/mcp-server` through `npx`. Check network access to npm, or run `npx -y @qa-ai-stlc/mcp-server` once by hand to warm the cache.                           |
| `Cannot find module` after changing code in a workspace  | A direct `vitest` or `tsc` run skips the dependency build. Use the `npm run` scripts, or `npm run build --workspace <package>` first.                                                            |
| Generation verification finds no tests on Windows        | Known gap, tracked as [#661](https://github.com/Klim-101/QA-AI-STLC/issues/661).                                                                                                                 |

Check the [roadmap](ROADMAP.md) for what is delivered and what is still open. A bug or a missing
step in this guide belongs in an [issue](https://github.com/Klim-101/QA-AI-STLC/issues/new/choose);
remove secrets, tokens, internal hostnames and personal data from anything you attach.
