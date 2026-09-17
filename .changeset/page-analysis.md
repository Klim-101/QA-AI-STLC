---
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/schemas': minor
---

Add page analysis to `@qa-ai-stlc/explorer`: `analyzePages()` builds a structured `PageModel` for each URL in a crawl's `RouteMap` — accessibility tree, interactive elements, forms, tables and dialogs — all length- and count-capped as untrusted, page-derived data. Page-state judgments (empty/loading/error) are deliberately not classified by the engine; only the structural signals an agent can interpret are captured.

`@qa-ai-stlc/core`'s `AuthPage` port gained `ariaSnapshotJSON()`, wrapping Playwright's own accessibility snapshot.

`@qa-ai-stlc/schemas` gained `PageModelSetSchema` (artifact kind `page-models`).
