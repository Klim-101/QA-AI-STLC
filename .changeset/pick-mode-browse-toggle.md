---
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Pick mode can now reach a control behind a collapsed panel. Its click capture swallows every click on an interactive element, so a toggle such as a "Search Details" button was recorded but never opened and the filter inputs inside it could not be picked. The toolbar has a **Browse** switch: while it is on, clicks go to the page and are not captured; switch it off and click the element to capture it. Because browsing lets a click act on the page, the pick-mode session now runs under safe mode's network rules: every non-GET request and every request off the environment allowlist is aborted (a `POST` the environment lists in `safeNonGetRequests` is let through), and the report lists what was blocked. `--pick <url>` refuses a page that is not on the allowlist of the resolved environment (`explorer.pick_mode.url_not_allowed`); with no environment, only the picked page's own host is allowed.
