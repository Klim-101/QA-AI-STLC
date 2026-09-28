---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/explorer': patch
---

Load the configuration in two layers (ADR-011): `.qa/config.yaml` plus an optional, git-ignored `.qa/config.local.yaml`, or the file named by `QA_CONFIG_LOCAL`. The local layer may set only `environments`, `identities`, `source` and `agents`; objects merge key by key and arrays and scalars replace. Validation errors name the file each bad value came from. Every CLI command except `init` prints a `CONFIG_RELAXATION` warning to stderr for each allowlist entry or `tlsInsecure: true` that the local layer adds. `qa init` adds `/config.local.yaml` to `.qa/.gitignore`, including in existing projects.
