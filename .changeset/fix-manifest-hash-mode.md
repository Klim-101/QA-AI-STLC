---
'@qa-ai-stlc/schemas': major
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/mcp-server': patch
---

Fix `ManifestStore.verifyContent()`'s try-both hashing (added in the #277 fix) letting a
CRLF-only edit to a bytes-registered artifact pass tamper detection: `hashText` normalizes CRLF to
LF, so `hashBytes(bytes("a\nb"))` equals `hashText("a\r\nb")` whenever the original bytes are the
UTF-8 encoding of LF-terminated text — trying a text hash as a fallback after a byte-hash mismatch
made this collision reachable by an attacker, not just theoretical.

`ManifestEntrySchema` now records `mode: 'text' | 'bytes'`, the hasher actually used at
registration time. `verifyContent` checks only that recorded mode instead of guessing.

Breaking for `@qa-ai-stlc/schemas`: `ManifestEntrySchema` gains a required `mode` field, so an
existing `.qa/manifest.json` written before this change fails validation until every project runs
an engine operation that re-registers its artifacts (`qa explore`, `qa scope`, etc.).
