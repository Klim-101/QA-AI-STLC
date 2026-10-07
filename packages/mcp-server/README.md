# @qa-ai-stlc/mcp-server

A local stdio MCP server over `@qa-ai-stlc/core`: a tool registry with Zod input/output schemas
(AGENTS.md 12.3). A `ToolDefinition`'s `handler` returns a value matching its `outputSchema` or
throws — a `QaError` for an expected failure, anything else for a bug — and `registerTool` turns
that into a structured `CallToolResult` carrying a stable `code` and, when there is one, a
`remediation`, never a raw stack trace. The server calls no model itself; it is driven by the
agent host's own model over the MCP protocol.

`qa-mcp-server` starts the stdio server with the built-in tools: `qa.ping` (a health check that
does not touch `.qa/`) and one tool per engine operation — `qa.doctor`, `qa.init`, `qa.config_show`,
`qa.config_set`, `qa.config_add`,
`qa.explore`, `qa.api_diff`, `qa.scope`, `qa.cases_add`, `qa.cases_render`, `qa.approve`, `qa.defect_add`, `qa.defect_accept`, `qa.validate`, `qa.run`,
`qa.report` — each
calling the exact same `packages/core` or `packages/explorer` function its CLI counterpart calls
(P2-05). `qa.explore` does not support manual pick-mode capture: opening a headed browser for a
human to click through is a CLI-only feature, not something an agent can drive over stdio.

Interactive case execution (P3-14/P3-15) adds `qa.http_execute` (the `api` test type, no browser),
`qa.registry_execute_register` and `qa.case_result_register`. `qa.generation_proven_session`
(P3-07) reads back a case's most recently proven `qa-execute` session — its evidence grouped by the
`stepId` each `browser.*`/`qa.http_execute` call tagged it with — for `qa-generate-tests` to codify
into a spec.

It also starts the six `browser.*` tools — `qa.browser_open`, `qa.browser_navigate`,
`qa.browser_click`, `qa.browser_fill`, `qa.browser_snapshot`, `qa.browser_close` — the only way
an agent may touch the application under test (ADR-005). Every one of them registers what it did
as hashed evidence under the session's run before it returns, so an exploratory session leaves a
complete trail and an unregistered screenshot is not a representable outcome. A session runs in
safe mode with no opt-out: non-GET requests are aborted, and navigation is limited to the
environment's domain allowlist. For component library widgets (`ui.componentLibrary`) four more
tools act at the widget level instead of replaying clicks: `qa.browser_select_option` (an option
by its visible text), `qa.browser_set_date`, `qa.browser_open_popup` and `qa.browser_close_popup`.
Each takes the selector the registry holds for the widget, finds the widget wrapper from it, and
verifies the widget's resulting state before it registers the evidence: a widget that does not
show the choice fails with `BROWSER_WIDGET_VALUE_MISMATCH`, which can be a defect worth reporting.
For data grids, `qa.browser_grid_find_row` finds a row by a column header and a cell value, paging or
scrolling through a grid that does not render every row, and `qa.browser_grid_read_cell` reads one
cell of that row; a row the grid never shows fails with `BROWSER_GRID_ROW_NOT_FOUND`.
`qa.browser_attach` is the other way to get a session: it connects to a Chrome the operator started
with `--remote-debugging-port` and already signed into (SSO, MFA), for an application the engine
cannot sign into itself. The endpoint must be on this machine; the session drives the first open
page that is on the environment allowlist, under safe mode, and closing it disconnects without
closing the operator's browser.
Unlike every other tool, these share one session store owned by
the server process, because a session spans several tool calls; it is closed on SIGINT/SIGTERM,
and an idle session is closed at the next call that touches it.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
