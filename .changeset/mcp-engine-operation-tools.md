---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/mcp-server': minor
---

Add MCP tools for every engine operation the CLI already exposes: `qa.doctor`, `qa.explore`,
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
