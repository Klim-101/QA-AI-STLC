---
'@qa-ai-stlc/cli': minor
---

Add the `qa` CLI: `qa init` creates the `.qa/` store, a starting `config.yaml` and a `.gitignore`; `qa doctor` checks Node, browsers, identities and environment reachability, with `--fix` to install missing browsers. Every command supports `--json` output and exits non-zero on failure.
