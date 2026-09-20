# @qa-ai-stlc/mcp-server

## 0.2.0

### Minor Changes

- 65d8538: Add MCP tools for every engine operation the CLI already exposes: `qa.doctor`, `qa.explore`,
  `qa.scope`, `qa.cases_add`, `qa.approve` and `qa.validate`. Each tool calls the exact same
  underlying operation its CLI command calls — `runDoctor`, `runScope`, `runCasesAdd`, `runApprove`
  and `runValidate` moved from `@qa-ai-stlc/cli` into `@qa-ai-stlc/core` as reusable, `EngineContext`-driven
  functions, and `runExplore`'s crawl/static-analysis/`--verify` logic moved into `@qa-ai-stlc/explorer`
  for the same reason — so the CLI and the MCP server share one implementation instead of two. `qa
explore`'s manual pick-mode capture (`--pick <url>`) stays CLI-only: it opens a headed browser for
  a human to click through, which an agent cannot drive over MCP's stdio transport. `report` has no
  CLI command yet, so it has no MCP tool yet either.

  `@qa-ai-stlc/core` gains a public `EngineContext` interface (`CommandContext` minus the CLI's own
  `io`/`json` concerns) that both the CLI and the MCP server build their own adapters into.

### Patch Changes

- Updated dependencies [65d8538]
  - @qa-ai-stlc/core@0.9.0
  - @qa-ai-stlc/explorer@0.7.0

## 0.1.2

### Patch Changes

- Updated dependencies [554ec6d]
  - @qa-ai-stlc/schemas@0.8.0
  - @qa-ai-stlc/core@0.8.0

## 0.1.1

### Patch Changes

- Updated dependencies [859a980]
  - @qa-ai-stlc/core@0.7.0

## 0.1.0

### Minor Changes

- b218ce9: Add `@qa-ai-stlc/mcp-server`, the local stdio MCP server: `qa-mcp-server` starts it. `ToolDefinition` pairs a Zod input and output schema with a handler that returns a value matching the output schema or throws — a `QaError` for an expected failure, anything else for a bug. `registerTool` turns a thrown error into a structured `CallToolResult` carrying a stable `code` and, when there is one, a `remediation`, never a raw stack trace; invalid tool input is rejected automatically by the registered Zod schema before the handler runs. Ships with one built-in tool, `qa.ping`, a health check. Calls no model itself.
