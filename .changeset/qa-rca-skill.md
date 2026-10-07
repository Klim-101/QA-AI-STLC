---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

Add the `qa-rca` skill and its spoke contract. `qa.rca_input` (new) builds the input a root cause analysis is written from — the accepted defect, the cases covering its requirements, their run history, the defect's evidence (hash, size and a bounded excerpt of text evidence between untrusted-data markers) and the configured source location — from registered artifacts only, refusing evidence changed since registration. `RcaSchema` gains `evidencePaths` for the evidence the facts rest on, and `qa.rca_add` rejects any path the engine did not register (`RCA_EVIDENCE_UNREGISTERED`). The RCA Markdown lists its evidence.
