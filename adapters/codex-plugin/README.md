# QA-AI-STLC plugin for Codex

QA-AI-STLC is an open-source, model-agnostic QA framework that runs inside Codex on your own subscription. A deterministic local engine owns the browser, the selector registry, evidence and the pipeline gates. This plugin adds the thin agent layer on top: skills that drive the engine through its tools.

## What the plugin contains

- **Skills** for the QA pipeline, from setting up a project and exploring the application to designing cases, generating and running tests, and reading reports.

## Register the engine

The skills drive a local MCP server, the engine. Codex starts a server that a plugin declares in the plugin's own cache directory, where it cannot find your project, so the plugin does not declare it. Register it once instead; Codex then starts it in the directory of your session:

```sh
codex mcp add qa-ai-stlc --env QA_EXPECTED_ENGINE_VERSION=1.15.0 -- npx -y @qa-ai-stlc/mcp-server@1.15.0
```

The server runs on your machine over stdio. To act on a project other than the session's directory, set `QA_PROJECT_ROOT` to its absolute path.

## What it does not do

- It makes no model calls and needs no API key. All reasoning happens in your Codex session.
- It talks to no hosted service and sends no telemetry. The engine contacts only the application URLs you allow in the project configuration.
- It does not create issues or pages in trackers such as Jira or GitHub. It produces tracker-neutral drafts for you to publish.

## Links

Source, documentation and issue tracker: https://github.com/Klim-101/QA-AI-STLC

Licensed under Apache-2.0.
