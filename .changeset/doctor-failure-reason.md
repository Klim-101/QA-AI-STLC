---
'@qa-ai-stlc/core': patch
---

`qa doctor` now says why a reachability check failed instead of only `is not reachable`. The environment and API-contract URL checks name the reason (no response within the limit, connection refused, host name not resolved, certificate not trusted, connection timed out or reset, invalid URL) and give a remediation that fits it, so a flaky result can be told from a down application. The message no longer carries the URL's credentials or query values: a URL such as `https://user:secret@host/spec?token=abc` is shown as `https://host/spec?token=[REDACTED]`, keeping the query keys. A response with any HTTP status still counts as reachable.
