---
'@qa-ai-stlc/core': patch
---

`qa.browser_tabs` no longer misses a page a link opened on a slow machine. It used to sleep a fixed 250 ms, shorter than the time Chromium takes to announce a new page here (about 650 ms); it now waits for the browser's announcement, up to a 2 s deadline counted from the previous tool call, and returns at once when the page was already announced.
