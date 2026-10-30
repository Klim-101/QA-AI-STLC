---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

An `apiAuth` `from-browser` profile can send a session cookie back as a `Cookie` header (`sendAs: cookie`), so an API case runs as a signed-in identity against an application with a server-side session. A response that redirects to a sign-in page is marked `blocked` by `qa.http_execute` and can no longer prove an `api` case passed.
