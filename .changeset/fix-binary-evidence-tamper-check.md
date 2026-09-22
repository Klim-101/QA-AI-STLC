---
'@qa-ai-stlc/core': major
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/mcp-server': patch
---

Fix `qa validate`/`qa.validate` reporting every binary evidence artifact (screenshots, traces,
video) as tampered, even freshly registered and untouched. `EvidenceStore` hashes binary content
byte-for-byte (`hashBytes`); the tamper check re-read every manifest-registered path through a
lossy UTF-8 text decode regardless of that, so a re-hash could never match.

`ManifestStore` gains `verifyContent(relativePath, rawBytes)`: since the manifest does not record
which hasher an entry used, it checks raw bytes against both a binary hash and a text hash of
their UTF-8 decoding, which is strictly more correct than assuming one encoding. The `FileSystem`
port gains a required `readBytes(absolutePath)` method (breaking for a custom implementation) so
the tamper check can read a file without assuming its encoding ahead of time.
