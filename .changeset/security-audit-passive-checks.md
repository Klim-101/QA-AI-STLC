---
'@qa-ai-stlc/runner-security': minor
---

Add the passive black-box security checks: `headers` (CSP, nosniff, framing, HSTS, Referrer-Policy, technology banners), `cookies` (HttpOnly, Secure, SameSite of the cookies an anonymous visitor receives; values are never recorded), `cors` (foreign and `null` origins, with or without credentials), `errors` (stack traces, database errors and framework banners in provoked error pages) and `encoding` (usual query parameters reflected unencoded; a clean result is `uncertain`, not `passed`). `DEFAULT_SECURITY_CHECKS` lists them. All send only GET requests through the authorized probe.
