---
'@qa-ai-stlc/schemas': patch
'@qa-ai-stlc/core': patch
---

The API-contract check of `qa doctor` now uses the settings of the environment that serves the contract, not only the defaults. A contract URL whose host, scheme and port an environment admits is fetched with that environment's `tlsInsecure` (only when every environment serving it asks for it, so one cannot weaken the check for another) and with its new `reachabilityTimeoutMs`. Before, the contract check always validated TLS, so a contract over HTTPS with a self-signed certificate failed although its environment passed, and it always gave up after 5 seconds. `reachabilityTimeoutMs` is an optional per-environment setting, from 1000 to 120000 milliseconds, that also applies to the environment's own reachability check; 5000 stays the default. A contract no environment serves is fetched with the defaults.
