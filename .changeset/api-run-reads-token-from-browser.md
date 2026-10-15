---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/runner-api': patch
'@qa-ai-stlc/cli': patch
'@qa-ai-stlc/mcp-server': patch
---

An api spec whose `apiAuth` profile reads its token from a browser session (`from-browser`) can now be verified and run. `qa.generation_verify` and `qa run` used to end in `API_AUTH_SESSION_REQUIRED` because nothing gave them a session. They now sign in as the run's identity (the `identity` argument, else the environment's `identity`) in a headless session under safe mode, load the environment's base URL, read the cookie, localStorage or sessionStorage key or request header the profile names, and close the session before the specs start; the token never reaches a spec, a log or a report. A run with no identity still stops with `API_AUTH_SESSION_REQUIRED`, and the remediation now names the identity. The run record names an identity only for runners that sign the specs in, so an api run does not claim a browser sign-in.
