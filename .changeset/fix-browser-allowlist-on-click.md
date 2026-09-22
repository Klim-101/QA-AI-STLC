---
'@qa-ai-stlc/core': major
---

Fix the browser domain allowlist not being enforced on navigation triggered by `qa.browser_click`
(or any other in-page action), only on `qa.browser_navigate`'s own input. Safe mode's route
handler, which sees every request a session makes regardless of what triggered it, now also
checks each GET request's hostname against the session's allowlist and aborts it the same way it
already aborts non-GET requests, instead of only inspecting the HTTP method.

Breaking for `@qa-ai-stlc/core`: `createBrowserSafeModeRouteHandler` takes the session's allowlist
as a new required first argument.
