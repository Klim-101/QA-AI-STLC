---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

The crawl finds single-page-application routes that have no `<a href>`: it reads `routerLink`, `ng-reflect-router-link` and `data-href` attributes and the URLs a page pushes through the History API. With `qa explore --probe-navigation` (`probeNavigation` on `qa.explore`) it also clicks buttons outside forms, each in a throwaway context under safe mode, and keeps the page a click led to (ADR-0015). The route map records how each route was found (`router-attribute`, `history-api`, `click-probe`).
