# @qa-ai-stlc/core

The deterministic engine underneath the `qa` CLI and the MCP server. This package owns the
`.qa/` store: reading and validating `config.yaml`, hashing every registered artifact into
`manifest.json`, and normalizing project-relative paths so a hash or a reference recorded on one
OS still resolves on another. `GateStateMachine` is the pipeline's hash-bound approval gate
(ADR-003): an artifact's content is hashed into `artifacts/approval-ledger.json` at approval time,
and every gate's live status in `state.json` is recomputed from that ledger, never trusted as a
cached field, so editing an approved artifact reopens its gate automatically.

It also owns the browser sessions an agent drives through the MCP `browser.*` tools (ADR-005):
`BrowserSessionStore` holds the live sessions, safe mode aborts every non-GET request, the
per-environment allowlist bounds navigation, and every action is registered through
`EvidenceStore` before the operation returns.

Filesystem access, wall-clock time, identifier generation and logging are injected through small
ports (`FileSystem`, `Clock`, `IdGenerator`, `Logger`) rather than called directly, so the engine's logic is testable without real
I/O and so hosts (CLI, MCP server, tests) can supply their own implementations.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
