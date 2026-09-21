---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
'@qa-ai-stlc/cli': minor
---

`.qa/` integrity (P2-07): `qa scope` and `qa cases add` (and their MCP counterparts) now verify
`artifacts/scope.json` against `manifest.json` before trusting it as a merge or link-check base,
so a hand-edited scope artifact is rejected with `ARTIFACT_HASH_MISMATCH` (or `ARTIFACT_UNREGISTERED`
for a file that was never registered through the engine) on the very next mutation, instead of being
silently built on. `qa validate` / `qa.validate` gains a `tamperedArtifacts` field that re-hashes
every path `manifest.json` has ever registered and reports any that are missing or no longer match —
catching tampering on artifacts nothing has mutated since, not only the ones a fresh `scope`/`cases add`
call happens to touch. `qa validate` now exits with a failure code and prints a "tampered artifact(s)"
section whenever `tamperedArtifacts` is non-empty.

`@qa-ai-stlc/core` also fixes a latent bug where `scope.json` and case files were hashed into the
manifest from a compact `JSON.stringify` while the file on disk was written in the canonical
two-space, trailing-newline form (`toCanonicalJson`) — the two never matched, which would have made
turning on manifest verification reject every legitimately engine-written artifact. Both paths now
hash and write the exact same bytes. `ManifestStore` gains `readVerified`, a schema-validated read
that throws instead of returning content that failed its hash check.
