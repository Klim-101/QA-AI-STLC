---
'@qa-ai-stlc/cli': patch
---

The `qa-start` skill now runs first-time setup in conversation through `qa.init`, `qa.config_add` and `qa.doctor`: it states the project root, asks each testing-scope question, and never answers one for the operator. The README quick start leads with that path and no longer claims `qa init` has interactive prompts.
