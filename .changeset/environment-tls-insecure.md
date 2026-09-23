---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/explorer': minor
'@qa-ai-stlc/cli': minor
---

Environments can now opt in to reaching a server behind a self-signed or internal-CA TLS
certificate (P2-18): `environments.<name>.tlsInsecure: true` in `config.yaml` (`EnvironmentConfigSchema`,
`packages/schemas`) bypasses certificate validation for that environment's `qa doctor` reachability
check and every `qa explore`/`qa.browser_open` browser session, including scripted login. Off by
default — an environment without it behaves exactly as before, rejecting an untrusted certificate.
Enabling it prints a coded warning (`ENVIRONMENT_TLS_INSECURE`) on every run that uses it, since it
weakens a real security guarantee.
