---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa.browser_snapshot` returns a `snapshotId` and accepts `since: <snapshotId>`: the view then lists only the lines added or removed since that snapshot of the same session, under the same size cap, and elements that did not change keep the refs they had. The full tree is still registered as evidence. An id from another session, or one past the last five kept, is `BROWSER_SNAPSHOT_UNKNOWN`.
