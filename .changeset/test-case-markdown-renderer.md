---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Reusable JSON-to-Markdown artifact renderer, starting with test cases (P2-25, ADR-002): a real
test case can now be rendered as a numbered, presentable Markdown document — preconditions, steps,
expected result and case metadata (feature, requirement links, regression tier, status) — instead
of only being visible as raw JSON.

- `qa cases render <id>` (CLI) and `qa.cases_render` (MCP) find the registered test case with the
  given id under `artifacts/cases/**` and render it to Markdown.
- The renderer lives behind a per-artifact-kind registry in `packages/core`, structured so a second
  artifact kind (`DefectDraftSchema`/RCA rendering, Phase 4+) can register its own Markdown
  template later without modifying the test-case renderer's code.
