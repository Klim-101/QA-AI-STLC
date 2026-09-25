# Executing an `api` case

No browser involved. Call `qa.http_execute` directly with the case's method, URL, headers and body
— whatever the case's steps describe the request as. One call per step that makes a request; a case
with several requests in sequence (for example, log in, then call an authenticated endpoint) calls
the tool once per request, threading any value the first response returned (a token, a cookie) into
the next call's `headers`/`body` yourself.

Each call registers the request and a capped preview of the response body as evidence and returns
only the status code — read the registered evidence back if the case's expected result needs to
check the response body or headers, not just the status.

`url` must be on the resolved environment's domain allowlist (`config.yaml`), the same
unconditional check every `qa.browser_*` tool applies (#364) — pass `environment` when the project
defines more than one. This restricts which host can be called, never which method: a real
POST/PUT/DELETE against an allowed host is exactly what proving the case works requires. Do not
follow a redirect or a response-supplied URL to a different host without confirming that is what
the case intends — `qa.http_execute` rejects it with `BROWSER_URL_NOT_ALLOWED` if it is not on the
allowlist, but a same-allowlist redirect to an unintended endpoint would still succeed.

## Reusable values

Prefer a value already registered as a `TestDataSchema` set (`testDataRefs` on the case) over
inventing one inline, the same convention `qa-design-cases` follows for case content.
