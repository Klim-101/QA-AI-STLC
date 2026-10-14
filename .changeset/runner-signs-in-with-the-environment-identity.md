---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/runner-playwright': minor
'@qa-ai-stlc/runner-a11y': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

Browser specs can now run against a site that needs sign-in. `qa run`, `qa.run` and `qa.generation_verify` sign in as a configured identity and start the browser with its session, so a spec carries no credential and no login steps. The identity is `--identity` / `identity` on the call, else the new `environments.<name>.identity` in `config.yaml`; with neither the run is anonymous. The run record, the run summary and the verification result name the identity used. The session exists only for the run (traces are off for it) and is never written to a report, log or artifact. A login that does not take stops the run with `RUN_SIGN_IN_FAILED` and a remediation, instead of running the specs against the login page; an unknown identity is `RUN_IDENTITY_UNKNOWN`.
