# Architecture diagram

How QA-AI-STLC's pieces fit together: the agent host, the deterministic engine, and the pipeline
state the two agree on. See [AGENTS.md](../../AGENTS.md) section 3 for the authoritative repository
map and section 2 for the non-negotiable boundaries these diagrams illustrate, and the
[architecture decision records](../adr/README.md) for why each boundary is where it is.

Solid boxes and edges exist today (mirrors the [roadmap](ROADMAP.md)'s "done"/"in progress" phases);
dashed ones are planned and not built yet (the Codex plugin and the VS Code extension).

## System context

Who calls what, and who owns the browser.

```mermaid
flowchart TB
    subgraph Host["Your machine, your subscription"]
        Model["Model in your agent host<br/>(Claude Code, Codex, ...)"]
        Skills["Agent skills and spokes<br/>(agents/: ten skills, hub and<br/>spoke definitions)"]
        CLI["qa CLI<br/>(@qa-ai-stlc/cli)"]
        MCP["qa-mcp-server<br/>(@qa-ai-stlc/mcp-server, stdio)"]
        Engine["Deterministic engine<br/>(@qa-ai-stlc/core + @qa-ai-stlc/explorer)"]
        Store[(".qa/ store<br/>config, artifacts, manifest,<br/>approval ledger, state.json")]
    end
    App["Application under test<br/>(non-production, allowlisted)"]

    Model -. "plans, no direct engine calls" .-> Skills
    Skills -->|"MCP tool calls"| MCP
    Model -->|"direct or scripted"| CLI
    MCP -->|"same core call as the CLI"| Engine
    CLI -->|"same core call as the MCP tool"| Engine
    Engine <-->|"reads and writes, hash-verified"| Store
    Engine -->|"browser automation, safe mode, domain allowlist"| App

```

**No model calls in the engine (ADR-001).** The box labelled "Model" is the only place in this
picture that calls an LLM. `core`, `explorer`, `cli` and `mcp-server` depend on no LLM SDK and make
no network call to one — verified in CI by `npm run lint`'s LLM-dependency denylist check.

**The engine owns the browser (ADR-004).** Neither the model nor a skill drives Playwright
directly; every interaction with the application under test goes through an engine tool that
registers evidence, navigates only inside the configured allowlist, and defaults to safe mode (no
form submission, no request that is not a safe read).

**No hosted infrastructure.** Every box above runs on your machine. `qa-mcp-server` is a local
stdio process your agent host spawns like any other local tool — no port, no container, no service
that outlives the session, no third-party MCP server bundled or required.

## Package dependency graph

Dependencies point downward only (AGENTS.md section 3); nothing here has a cycle.

```mermaid
flowchart TD
    schemas["@qa-ai-stlc/schemas<br/>Zod schemas, canonical JSON, migrations"]
    core["@qa-ai-stlc/core<br/>.qa/ store, gates, approval ledger,<br/>evidence, engine operations"]
    explorer["@qa-ai-stlc/explorer<br/>crawler, static analysis, locator<br/>synthesis, selector registry"]
    cli["@qa-ai-stlc/cli<br/>qa command"]
    mcpserver["@qa-ai-stlc/mcp-server<br/>local stdio MCP server"]
    runner["@qa-ai-stlc/runner-*<br/>playwright, api, a11y, security"]
    agents["agents/<br/>skills, hub and spoke definitions"]
    adapters["adapters/*<br/>Claude Code plugin — generated<br/>(Codex plugin and VS Code<br/>extension planned)"]

    core --> schemas
    explorer --> schemas
    explorer --> core
    cli --> core
    cli --> explorer
    mcpserver --> core
    mcpserver --> explorer
    runner --> core
    agents -.-> mcpserver
    agents -.-> cli
    adapters -.-> agents
```

`schemas` depends on nothing internal — every artifact's shape is defined once and imported
everywhere else. `core` and `explorer` are the deterministic engine; `cli` and `mcp-server` are
thin hosts over it, each an entry point into the exact same operations (P2-05): a CLI command and
its MCP tool counterpart call one shared function in `core` or `explorer`, never two
implementations of the same behavior.

## Engine operations, shared by both hosts

`packages/core/src/operations/*.ts` and `packages/explorer/src/operations/explore.ts` are each
called from two places — a CLI command and an MCP tool — through a common `EngineContext`
(filesystem, clock, logger, process runner, HTTP client, browser launcher, environment,
project root) that the CLI and the MCP server each build from their own real adapters.

```mermaid
flowchart LR
    subgraph Operations["packages/core/src/operations + packages/explorer/src/operations"]
        doctor["runDoctor"]
        scope["runScope"]
        cases["runCasesAdd"]
        approve["runApprove"]
        validate["runValidate"]
        explore["runExplore"]
        run["runTestRun / runReport"]
        spokes["triage, review, regression plan,<br/>run metrics, spec check"]
        browser["runBrowserOpen / Navigate /<br/>Click / Fill / Snapshot / Close"]
    end

    cliDoctor["qa doctor"] --> doctor
    mcpDoctor["qa.doctor"] --> doctor
    cliScope["qa scope"] --> scope
    mcpScope["qa.scope"] --> scope
    cliCases["qa cases add"] --> cases
    mcpCases["qa.cases_add"] --> cases
    cliApprove["qa approve"] --> approve
    mcpApprove["qa.approve"] --> approve
    cliValidate["qa validate"] --> validate
    mcpValidate["qa.validate"] --> validate
    cliExplore["qa explore"] --> explore
    mcpExplore["qa.explore"] --> explore
    cliRun["qa run / qa report"] --> run
    mcpRun["qa.run / qa.report"] --> run
    cliSpokes["qa triage / review / regression /<br/>metrics / spec"] --> spokes
    mcpSpokes["qa.triage_* / review_* / regression_plan /<br/>run_metrics / spec_check"] --> spokes

    pick["qa explore --pick &lt;url&gt;<br/>CLI-only: a human clicks a<br/>headed browser window"] -. "shares only the registry-write tail" .-> explore

    mcpBrowser["qa.browser_open / _navigate /<br/>_click / _fill / _snapshot / _close<br/>MCP-only: ADR-005"] --> browser
    browser --> evidence["EvidenceStore<br/>hashed, registered in manifest.json"]
```

The `browser.*` tools have no CLI counterpart on purpose: an exploratory session is a sequence of
calls an agent makes, and ADR-005 exists so that sequence is the only way an agent reaches a
browser at all.

The rule holds for the whole engine surface: a capability without a CLI command has no MCP tool
either, except the `browser.*` tools above and pick mode, whose reasons are stated where they are
made.

## Pipeline state and gates (ADR-003)

`state.json` is never trusted as cached truth: `qa validate` (and its MCP counterpart) always
recomputes every gate's status from the approval ledger plus each approved artifact's current
content. Approving a phase hashes its artifact's exact content into an append-only ledger; editing
the artifact afterward changes its hash, so the next recompute reports the gate reopened — a
tamper/drift detector, not a checkbox.

```mermaid
flowchart LR
    scope(("scope<br/>open")) -->|"qa approve scope<br/>--artifact artifacts/scope.json"| scopeDone(("scope<br/>satisfied"))
    scopeDone -->|"edit scope.json"| scope
    scopeDone --> cases(("cases<br/>open"))
    cases -->|"qa approve cases<br/>--artifact ..."| casesDone(("cases<br/>satisfied"))
```

The state machine tracks `scope` and `cases`. Defect acceptance (`qa defect accept`), root cause
analysis review (`qa rca approve`) and the security authorization (`qa security approve`) are
approvals of their own, each bound to the exact content of its artifact, so an edit afterwards
reads as unapproved; they are not phases of `state.json`, and the security audit is never part of
the pipeline.

Every registered test case must link to at least one requirement (`TestCaseSchema.requirementIds`,
schema-level), and every link must actually resolve in `artifacts/scope.json` (`qa cases add`,
checked once at registration, and `qa validate`, re-checked on every run) — so a requirement
deleted or renamed after a case was written is caught, not silently stale.

## Related documents

- [Roadmap](ROADMAP.md): phases, current status, what is deliberately out of scope.
- [Architecture decision records](../adr/README.md): the significant, hard-to-reverse decisions
  behind these boundaries.
- [README](../../README.md): quick start, real command output, and the animated demos this
  diagram's boxes correspond to.
