# @qa-ai-stlc/mcp-server

## 0.1.0

### Minor Changes

- b218ce9: Add `@qa-ai-stlc/mcp-server`, the local stdio MCP server: `qa-mcp-server` starts it. `ToolDefinition` pairs a Zod input and output schema with a handler that returns a value matching the output schema or throws — a `QaError` for an expected failure, anything else for a bug. `registerTool` turns a thrown error into a structured `CallToolResult` carrying a stable `code` and, when there is one, a `remediation`, never a raw stack trace; invalid tool input is rejected automatically by the registered Zod schema before the handler runs. Ships with one built-in tool, `qa.ping`, a health check. Calls no model itself.
