# Contract and authentication

## The contract

`api.source` names where the OpenAPI 3.x document comes from:

- a **file** path, or a **URL** on the environment's allowlist;
- `discover`: the engine probes well-known spec paths with GET requests only
  (`API_CONTRACT_DISCOVERY_FAILED` when none serves one; then ask for the file or URL);
- `synthesize`: a draft built from observed traffic. It is not a contract until the operator approves
  it as one (`API_CONTRACT_SYNTHESIZE_UNSUPPORTED`). Tell the operator the choice is theirs; do not
  switch `api.source` to make the error go away.

The contract's SHA-256 is recorded with every diff and every generated spec. When it changes, specs
generated against the old one are stale (`API_SPEC_CONTRACT_CHANGED`): regenerate them through
`qa-generate-tests`.

## Reading a diff

| Count                 | Meaning                                                               |
| --------------------- | --------------------------------------------------------------------- |
| `matched`             | observed and documented                                               |
| `undocumented`        | observed, not in the contract: contract gap or an unintended endpoint |
| `methodNotDocumented` | path documented, observed with another method                         |
| `unobserved`          | documented, not seen by the crawl; coverage, not a defect             |

Present undocumented endpoints as findings for the operator to judge. Do not file them as defects.

## Authentication

A request authenticates through a named profile, passed as `auth` to `qa.http_execute`; with none, the
environment's default profile applies.

1. No profile yet and the app has a login: open a signed-in browser session (`qa.browser_open`, or
   `qa.browser_attach` for SSO and MFA), open a page that calls the API, then
   `qa.browser_discover_api_auth`. It reports header and storage-key names only and a
   `proposedProfile` (`API_AUTH_DISCOVERY_NO_TOKEN`: visit a page that makes an authenticated call and
   ask again).
2. Register it with `qa.config_add_api_auth`, with a name and `defaultForEnvironment` for the
   environment under test.
3. **A server-side session (a cookie, not a token).** If the application keeps you signed in with a
   session cookie and `qa.browser_discover_api_auth` finds no token, add a `from-browser` profile
   whose source is the session cookie sent back as a cookie, for example
   `{ type: 'from-browser', source: { kind: 'cookie', name: 'connect.sid', sendAs: 'cookie' } }`. Ask
   the operator for the session cookie's name (browser developer tools, Application, Cookies; the name
   only, never the value). Then
   sign in with `qa.browser_open` and the case's identity and pass its `sessionId` to
   `qa.http_execute`; the API runner signs in as the identity itself. The default `sendAs: 'bearer'`
   is for a cookie that holds a token.
4. A service account is a `bearer`, `basic`, `api-key` or `oauth2-client-credentials` profile. Each
   secret is the NAME of a `QA_` environment variable that the operator sets; you never see or write
   its value.

## A redirect to a sign-in page

A call that is not authenticated, or whose session lapsed, is redirected to the application's sign-in
page. `qa.http_execute` marks that response `blocked: { reason: 'login-redirect', location }`: its
status (even a 200) is the login page's and proves nothing about the endpoint, and the engine refuses
`passed` on it. Register the case as `blocked`, then authenticate the call (above) and run it again.
