# QA-AI-STLC

Open-source, model-agnostic QA framework that runs inside the agent host you already use: Claude Code or Codex.

> **Status: pre-alpha.** The engine packages (`schemas`, `core`, `explorer`, `cli`) are published to npm and covered by tests. `qa explore` runs end to end — crawl, static source analysis, locator synthesis, selector registry, stale-selector detection — against a real running application (see the example below). There is no agent-host plugin or MCP server yet — see the [roadmap](docs/public/ROADMAP.md) for what that leaves planned.

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
npx @qa-ai-stlc/cli init --e2e in-scope --api out-of-scope --a11y out-of-scope --security out-of-scope
npx @qa-ai-stlc/cli doctor
```

`qa init` runs a short scope survey — each of Web E2E, API, accessibility and security testing is
answered `in-scope`, `out-of-scope` or (with `--defer-scope`) left `undecided` for later. Passing
the answers as flags, as above, skips the interactive prompts; change a decision later with
`qa config set testing.<type> <value>`. `qa doctor` checks Node, installed browsers, identities and
environment reachability.

Add an environment and an identity — validated against the schema, no hand-editing `.qa/config.yaml` — then explore it:

```sh
npx @qa-ai-stlc/cli config add environment staging \
  --base-url https://staging.example.com/dashboard --allowlist staging.example.com
npx @qa-ai-stlc/cli config add identity admin \
  --auth storage-state --secret QA_ADMIN_PASSWORD \
  --login-url https://staging.example.com/login --username admin@example.com
npx @qa-ai-stlc/cli explore --environment staging --identity admin
```

This is the actual output of that command against [`examples/demo-app`](examples/demo-app), a
small task tracker used to validate the explorer against a real, running application:

```
Wrote selectors/registry.json: 78 element(s) (78 added, 0 removed, 0 degraded).
0 element(s) with no locator candidate.
0 non-GET request(s) blocked by safe mode.
```

`--json` gives the same result as data instead of text:

```json
{
  "command": "explore",
  "data": {
    "mode": "explore",
    "registryPath": "selectors/registry.json",
    "elementCount": 78,
    "added": 78,
    "removed": 0,
    "degraded": [],
    "missingLocatorCount": 0,
    "blockedRequestCount": 0
  }
}
```

Everything the framework creates lives in `.qa/`, plus a generated locator module in
`tests/qa/locators.ts`. A couple of real entries from each, unedited:

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

Generated tests reference locators through this module by name (`apply(page)`), never through a
literal selector, so a selector change is a one-line diff here instead of a search-and-replace
across every test file.

### Catching a stale selector

`qa explore --verify` re-checks every stored primary candidate against the live page, without
re-crawling — the only way to actually notice a selector that used to work and no longer does. With
`examples/demo-app`'s "Apply" filter button renamed from `data-testid="apply-filter"` to
`apply-filter-renamed` on the live page but not yet re-crawled:

```
Verified selectors/registry.json: 78 element(s) checked.
1 degraded selector(s):
  e4fdfc0102d95678698c91fff17367185e23560634c6d531cf896bdcf554f65b: 1 -> 0
```

The exit code is non-zero, so this is a real CI gate: a rename ships broken tests only if nobody
looks, and `--verify` catches it before that happens.

### Static source analysis

`qa explore --static` (with `source.path` set in `config.yaml`) merges a lightweight scan of your
source into the same registry — elements a crawl alone would miss, and every field with no
`data-testid`, `aria-label` or `role` to name it, recorded in
`.qa/selectors/missing-test-ids.json` with its file and line. Against the same demo app's real,
unmodified views: 26 of its 105 elements have no locator candidate at all — a login form and a
"new task" form, neither with a `data-testid` on any field, a deliberately catalogued gap.

Static route extraction is also available as a library function ahead of its own CLI flag (see the
[roadmap](docs/public/ROADMAP.md)) — React Router, Vue Router and Angular route configs, with file
and line:

```ts
import { analyzeStaticRoutes } from '@qa-ai-stlc/explorer';

const { routes } = analyzeStaticRoutes({
  files: [
    {
      filePath: 'src/App.tsx',
      content:
        '<Routes>\n  <Route path="/dashboard" element={<Dashboard />}>\n    <Route path="/dashboard/tasks" element={<Tasks />} />\n  </Route>\n</Routes>',
    },
  ],
});
```

```json
[
  { "path": "/dashboard", "filePath": "src/App.tsx", "line": 2 },
  { "path": "/dashboard/tasks", "filePath": "src/App.tsx", "line": 3 }
]
```

### Pick mode

When a crawl can't reach an element (behind a multi-step flow, a modal, a canvas widget), record it
by hand instead: `qa explore --pick <url>` opens the page, lets you click the element, and writes a
registry entry with `"source": "manual"` — same schema, same downstream locator generation, honestly
labelled as not crawler-discovered:

```json
{ "elementId": "element-1", "source": "manual", "pii": false, "dynamicText": false }
```

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
