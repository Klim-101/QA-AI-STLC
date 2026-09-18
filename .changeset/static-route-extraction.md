---
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/schemas': minor
---

Add static route extraction to `@qa-ai-stlc/explorer`: `analyzeStaticRoutes()` extracts client-side route declarations from source — React Router's `<Route path="...">` JSX, and Vue Router's/Angular's `path: '...'` route-config objects under a `routes` array — with file and line locations, using the same lightweight lexical scan `analyzeStaticSource()` already uses rather than a per-framework AST parser. `mergeStaticRoutes()` merges the findings into a crawler-produced `RouteMap`, resolving each path against the map's own `startUrl` origin and skipping a route the crawler already found.

`@qa-ai-stlc/schemas`'s `RouteDiscoveryMethodSchema` gains a `'static'` value, and `DiscoveredRouteSchema` gains an optional `sourceLocation` (the file and line a static route was found at, since there is no live navigation to point at instead).
