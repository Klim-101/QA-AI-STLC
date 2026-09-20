# @qa-ai-stlc/mcp-server

A local stdio MCP server over `@qa-ai-stlc/core`: a tool registry with Zod input/output schemas
(AGENTS.md 12.3). A `ToolDefinition`'s `handler` returns a value matching its `outputSchema` or
throws — a `QaError` for an expected failure, anything else for a bug — and `registerTool` turns
that into a structured `CallToolResult` carrying a stable `code` and, when there is one, a
`remediation`, never a raw stack trace. The server calls no model itself; it is driven by the
agent host's own model over the MCP protocol.

`qa-mcp-server` starts the stdio server with the built-in tools (currently `qa.ping`, a health
check that does not touch `.qa/`). The engine-operation tools (doctor, explore, scope, cases,
approve, validate, report) are a separate, later task.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
