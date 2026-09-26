---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Adds `qa link <spec> <requirement-id> --feature <name>` / `qa.link`: folds an already-existing,
hand-written Playwright spec into the requirement → case → result → evidence traceability matrix
without running it through generation. Reuses the spec's own `testCaseId` annotation when present,
so a later `qa run` still attributes its result to the same case.
