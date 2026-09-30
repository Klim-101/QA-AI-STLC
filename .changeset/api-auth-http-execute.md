---
'@qa-ai-stlc/core': minor
---

`runHttpExecute` authenticates through a named `apiAuth` profile (`auth`, or the environment's default): basic, bearer, api-key in a header or query parameter, custom headers and OAuth2 client credentials with an in-memory token cache. Credentials are read from `QA_*` variables, attached only after the request URL passes the allowlist (the token URL is checked too), never sent across a redirect, and scrubbed by value and by configured name from the stored request record. Response `Set-Cookie` and `Authorization` headers are now redacted in http-request evidence.
