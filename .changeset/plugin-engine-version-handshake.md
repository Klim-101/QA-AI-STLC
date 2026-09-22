---
'@qa-ai-stlc/mcp-server': minor
---

Add the engine/plugin version handshake (P2-12, ADR-007): the generated Claude Code plugin's
`.mcp.json` now pins the engine version it expects into `QA_EXPECTED_ENGINE_VERSION`. At start,
the MCP server compares that against its own version and, on a mismatch, exits with a coded
`ENGINE_VERSION_MISMATCH` error and a remediation instead of silently running a different engine
version than the plugin was generated against. A server started without that variable set (for
example directly from the CLI during development) is unaffected.
