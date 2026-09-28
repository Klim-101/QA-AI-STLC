---
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

`qa init` writes a commented `.qa/config.local.yaml.example` showing the optional local configuration layer's syntax (ADR-011). `qa doctor` / `qa.doctor` now report every relaxation the local layer introduces (a widened allowlist entry or `tlsInsecure: true`), the same way `qa config show` / `qa.config_show` already do — `DoctorReport` gains a `relaxations` field. README and CONTRIBUTING describe the configuration layers.
