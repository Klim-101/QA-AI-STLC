---
'@qa-ai-stlc/explorer': minor
---

Add manual pick mode to `@qa-ai-stlc/explorer`: `injectPickModeOverlay()` opens a headed-browser overlay a human clicks through to capture interactive elements, `waitForPickModeCompletion()` collects every capture once the human confirms they are done, `capturePickModeElements()` synthesizes and scores locator candidates for each one against the live page, and `finalizeManualSelectorEntries()` turns confirmed names into `source: 'manual'` registry entries. A manually-picked element gets the same `elementId` a crawl would assign it, so a page later crawled does not duplicate a pick-mode entry. Every click is intercepted before it reaches the application (safe mode), so pick mode never submits a form or triggers a real navigation.
