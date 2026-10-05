---
runs: 2
max_turns: 10
allowed_tools:
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_open
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_attach
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_navigate
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_click
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_fill
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_press
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_hover
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_check
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_select_option
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_set_date
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_open_popup
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_close_popup
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_grid_find_row
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_grid_read_cell
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_snapshot
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_expect
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_wait_for
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_tabs
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_upload
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_console
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_network
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_accessibility_scan
  - mcp__plugin_qa-ai-stlc_qa-ai-stlc__qa_browser_close
---

The application signs in through the company single sign-on with a one-time code, so the engine cannot log in itself. The operator has signed in in their own Chrome, started with --remote-debugging-port=9222. Continue the case in that signed-in browser, then stop.
