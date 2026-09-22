---
'@qa-ai-stlc/core': patch
---

Fix HAR redaction skipping the request/response body, and the secret scanner's safety net missing
an unquoted credential in a URL-encoded form. `redactHar` only touched `headers`/`cookies`, so a
login form's POST body (`username=alice&password=hunter2`) could reach `.qa/evidence/` completely
unredacted while still reporting `redacted: true`. The scanner's `password-assignment`/
`api-key-assignment` patterns also required a quoted value, so `password=hunter2` (no quotes, a
normal URL-encoded shape) didn't trip the fallback that exists specifically to catch what
redaction couldn't understand.

`redactHar` now also redacts known-sensitive fields (password, token, secret, API key) in
`request.postData`/`response.content`, for both JSON and URL-encoded bodies. The scanner's two
patterns now also match an unquoted value.
