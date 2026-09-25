---
'@qa-ai-stlc/mcp-server': minor
---

Exposes P3-14's interactive case execution operations over MCP, so an agent host can actually
drive them (they previously existed only in `@qa-ai-stlc/core`, unreachable from any host):

- `qa.browser_open` gains the `executionMode` option (ADR-0009), previously core-only.
- New tools: `qa.http_execute` (a real HTTP call for the `api` test type), `qa.browser_accessibility_scan`
  (a real axe-core scan for `a11y`), `qa.registry_execute_register` (promotes an ad hoc element pick
  into the selector registry as `source: "execute"`), and `qa.case_result_register` (ties an
  execution's evidence together into a registered run result; the caller supplies the pass/fail
  verdict, never the engine).

Backs the new `qa-execute` skill (P3-15, `agents/skills/qa-execute/`), which drives these tools to
prove an approved test case actually works before any code is generated for it.
