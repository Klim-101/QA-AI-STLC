---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Explore can now register what a page keeps out of sight or does not mark as interactive. `qa explore --expand-collapsed` (MCP `expandCollapsed`) opens each page's collapsed panels (`aria-expanded="false"` controls that are not links, submit buttons or pop-up triggers, plus a component library profile's own selectors) in a throwaway context under safe mode, and registers the filter inputs that appear; the report gives `expandedPanelCount`. Scoring and `--verify` reopen the panels after each reload, so those controls resolve. Elements that carry the configured test id and look operable (a sortable header, a status chip) are registered with the new kind `element`, and the Kendo UI for Angular profile registers a grid header cell under its title. `--probe-navigation` also clicks `role="button"` elements; a bare `div`, an anchor without `href` and a button inside a form are still skipped.
