# @qa-ai-stlc/mcp-server

A local stdio MCP server over `@qa-ai-stlc/core`: a tool registry with Zod input/output schemas
(AGENTS.md 12.3). A `ToolDefinition`'s `handler` returns a value matching its `outputSchema` or
throws — a `QaError` for an expected failure, anything else for a bug — and `registerTool` turns
that into a structured `CallToolResult` carrying a stable `code` and, when there is one, a
`remediation`, never a raw stack trace. The server calls no model itself; it is driven by the
agent host's own model over the MCP protocol.

`qa-mcp-server` starts the stdio server with the built-in tools: `qa.ping` (a health check that
does not touch `.qa/`) and one tool per engine operation — `qa.doctor`, `qa.explore`, `qa.scope`,
`qa.cases_add`, `qa.approve`, `qa.validate` — each calling the exact same `packages/core` or
`packages/explorer` function its CLI counterpart calls (P2-05). `qa.explore` does not support
manual pick-mode capture: opening a headed browser for a human to click through is a CLI-only
feature, not something an agent can drive over stdio. `report` has no CLI command yet, so it has
no MCP tool yet either.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
