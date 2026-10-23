---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/explorer': patch
---

Make `qa explore` and `qa explore --verify` faster: the sign-in, crawl, page analysis and scoring steps of one run now share a single Chromium instead of starting one each, and the stability check counts candidates in small concurrent batches instead of one at a time. Every step still opens browser contexts of its own, so sessions stay isolated. `@qa-ai-stlc/core` exports `createSharedBrowserLauncher`.
