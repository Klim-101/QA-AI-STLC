---
'@qa-ai-stlc/schemas': minor
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/runner-security': minor
---

Add the code-assisted security level, used when `source.path` is set. Three new check classes, `dependencies` (`npm audit` over the lockfile), `secrets` (credentials committed with the code; the value is never reported) and `configuration` (debug and test-only routes, debug mode, cookies without HttpOnly or Secure, disabled certificate verification, a wildcard CORS origin), read the checkout through a read-only view and run only when the authorization names them. Findings now carry `codeReferences` (project-relative file and line), and a security defect draft lists them under "Code references". Without `source.path`, or when it points at nothing, the code-assisted classes are `skipped` and the audit logs a notice that it ran black-box only.
