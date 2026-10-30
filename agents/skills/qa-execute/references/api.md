# Executing an `api` case

No browser involved. Call `qa.http_execute` directly with the case's method, URL, headers and body
— whatever the case's steps describe the request as. One call per step that makes a request; a case
with several requests in sequence (for example, log in, then call an authenticated endpoint) calls
the tool once per request, threading any value the first response returned (a token, a cookie) into
the next call's `headers`/`body` yourself.

**Pass `stepId: 'step-<N>'`** on each call, where `N` is that step's 1-based position in the case's
`steps` array (the first step is `step-1`) — the same convention `references/web.md` uses for
browser actions. This is what lets `qa-generate-tests` (P3-07) recover this session's proven steps
from evidence alone; a call omitting it is invisible to generation.

Each call registers the request and a capped preview of the response body as evidence and returns
only the status code — read the registered evidence back if the case's expected result needs to
check the response body or headers, not just the status.

`url` must be on the resolved environment's domain allowlist (`config.yaml`), the same
unconditional check every `qa.browser_*` tool applies (#364) — pass `environment` when the project
defines more than one. This restricts which host can be called. A method that is not a safe read
(POST, PUT, PATCH, DELETE) also needs `caseId`, the id of the case you execute; the engine refuses it with
`HTTP_EXECUTE_CASE_REQUIRED` without one and with `EXECUTION_CASE_NOT_APPROVED` until the operator has
approved the `cases` gate, so ask the operator to approve rather than working around it. A GET, HEAD,
OPTIONS or QUERY needs no case. Do not
follow a redirect or a response-supplied URL to a different host without confirming that is what
the case intends — `qa.http_execute` rejects it with `BROWSER_URL_NOT_ALLOWED` if it is not on the
allowlist, but a same-allowlist redirect to an unintended endpoint would still succeed.

## Authenticating the request

Pass `auth: '<profile>'` to `qa.http_execute` for a request that needs credentials; with no `auth`
the environment's default profile is used. Never ask the operator to edit `.qa/config.yaml`, and never
write a token into a header yourself. When there is no profile yet:

1. Sign in with a browser session (`qa.browser_open` with the case's identity, or `qa.browser_attach`
   for SSO and MFA) and open a page that calls the application's API.
2. Call `qa.browser_discover_api_auth` with that session. It reports the request header that carries
   the token and the cookie, localStorage or sessionStorage key that stores it, as names only, plus a
   `proposedProfile`. `API_AUTH_DISCOVERY_NO_TOKEN` means no authenticated API call was seen yet:
   navigate to a page that makes one and ask again.
3. Pass the proposed profile to `qa.config_add_api_auth` with a name and, for the environment you are
   testing, `defaultForEnvironment`. A service account instead gets a `bearer`, `basic`, `api-key` or
   `oauth2-client-credentials` profile; each secret is the NAME of a `QA_` variable the operator sets
   themselves, never its value.
4. Call `qa.http_execute` with `browserSessionId` of that session so the token is read from it.

An application that keeps a server-side session needs a profile whose source is the session cookie sent
as a cookie; see `qa-api`'s authentication reference. A response with `blocked` set was redirected to
the sign-in page: the status is not the endpoint's, so register the case as `blocked`, not `passed`
or `failed`.

## Reusable values

Prefer a value already registered as a `TestDataSchema` set (`testDataRefs` on the case) over
inventing one inline, the same convention `qa-design-cases` follows for case content.
