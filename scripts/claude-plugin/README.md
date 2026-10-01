# QA-AI-STLC plugin for Claude Code

QA-AI-STLC is an open-source, model-agnostic QA framework that runs inside Claude Code on your own subscription. A deterministic local engine owns the browser, the selector registry, evidence and the pipeline gates. This plugin adds the thin agent layer on top: skills that drive the engine through its tools.

## What the plugin contains

- **Skills** for the QA pipeline: `qa-start` (set up and scope), `qa-explore` (explore the application under test), `qa-design-cases` (design test cases), `qa-generate-tests` (generate and verify automated tests), `qa-execute` (run approved cases and register evidence) and `qa-report` (render reports and defect drafts).
- **A local MCP server**, declared in `.mcp.json`, started with `npx` at a pinned version. It runs on your machine over stdio.
- **One hook**, `hooks/block-qa-writes.mjs`, a `PreToolUse` hook on `Write` and `Edit` that blocks direct edits to the engine's `.qa/` data so evidence and approvals cannot be created by hand.

## What it does not do

- It makes no model calls and needs no API key. All reasoning happens in your Claude Code session.
- It talks to no hosted service and sends no telemetry. The engine contacts only the application URLs you allow in the project configuration.
- It does not create issues or pages in trackers such as Jira or GitHub. It produces tracker-neutral drafts for you to publish.

## Install

```sh
claude plugin marketplace add Klim-101/QA-AI-STLC
claude plugin install qa-ai-stlc
```

Then ask Claude Code to start a QA project, for example "set up QA for this application".

## Links

Source, documentation and issue tracker: https://github.com/Klim-101/QA-AI-STLC

Licensed under Apache-2.0.
