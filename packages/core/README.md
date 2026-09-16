# @qa-ai-stlc/core

The deterministic engine underneath the `qa` CLI and the MCP server. This package owns the
`.qa/` store: reading and validating `config.yaml`, hashing every registered artifact into
`manifest.json`, and normalizing project-relative paths so a hash or a reference recorded on one
OS still resolves on another.

Filesystem access, wall-clock time and logging are injected through small ports (`FileSystem`,
`Clock`, `Logger`) rather than called directly, so the engine's logic is testable without real
I/O and so hosts (CLI, MCP server, tests) can supply their own implementations.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
