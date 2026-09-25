# Executing an `api` case

No browser involved. Call `qa.http_execute` directly with the case's method, URL, headers and body
— whatever the case's steps describe the request as. One call per step that makes a request; a case
with several requests in sequence (for example, log in, then call an authenticated endpoint) calls
the tool once per request, threading any value the first response returned (a token, a cookie) into
the next call's `headers`/`body` yourself.

Each call registers the request and a capped preview of the response body as evidence and returns
only the status code — read the registered evidence back if the case's expected result needs to
check the response body or headers, not just the status.

## Known limitation: no domain allowlist check

Unlike every `qa.browser_*` tool, `qa.http_execute` does not currently restrict `url` to the
environment's configured allowlist (`config.yaml`) — it calls whatever URL it is given. Only call it
with a URL the operator's case actually targets; do not follow a redirect or a response-supplied URL
to a different host without confirming that is what the case intends. This is a known engine gap,
not a skill-level check this file can compensate for.

## Reusable values

Prefer a value already registered as a `TestDataSchema` set (`testDataRefs` on the case) over
inventing one inline, the same convention `qa-design-cases` follows for case content.
