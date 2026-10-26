# QA-AI-STLC plugin for Codex

QA-AI-STLC is an open-source, model-agnostic QA framework that runs inside Codex on your own subscription. A deterministic local engine owns the browser, the selector registry, evidence and the pipeline gates. This plugin adds the thin agent layer on top: skills that drive the engine through its tools.

## What the plugin contains

- **Skills** for the QA pipeline, from setting up a project and exploring the application to designing cases, generating and running tests, and reading reports.
- **A local MCP server**, declared in `mcp.json`, started with `npx` at a pinned version. It runs on your machine over stdio.

## What it does not do

- It makes no model calls and needs no API key. All reasoning happens in your Codex session.
- It talks to no hosted service and sends no telemetry. The engine contacts only the application URLs you allow in the project configuration.
- It does not create issues or pages in trackers such as Jira or GitHub. It produces tracker-neutral drafts for you to publish.

## Links

Source, documentation and issue tracker: https://github.com/Klim-101/QA-AI-STLC

Licensed under Apache-2.0.
