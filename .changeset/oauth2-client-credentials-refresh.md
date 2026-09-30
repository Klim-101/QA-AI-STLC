---
'@qa-ai-stlc/core': minor
---

An `oauth2-client-credentials` profile that gets a 401 with a cached token now drops the token, fetches a new one and retries the call once; a token that was just fetched is never retried. Every credential used by either attempt is scrubbed from the stored request record.
