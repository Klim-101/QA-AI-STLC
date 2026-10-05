# ADR-0012: API authentication profiles

Status: Accepted
Date: 2026-09-29

## Context

`qa.http_execute` (P3-14) accepts raw `headers` from the caller. Against a protected API that means
the agent has to hold and pass the credential: it reads a secret, puts it into a tool call, and the
tool call, the model context and any transcript now contain it. Nothing in the engine can stop that,
because the header is just a string. This contradicts the rule that secrets never appear in tool
output, evidence or logs (AGENTS.md 2.8, 5.8, 12.5), and the secret scan on evidence is only a safety
net for the shapes it recognises.

Real projects protect their APIs in several ways, and the framework has to work with all of them
without the agent ever seeing a secret:

- a static token or key sent as a header or a query parameter (basic, bearer, API key, a custom
  header set);
- a token obtained from a token endpoint with a client id and secret (OAuth 2 client credentials),
  which expires and has to be refreshed;
- a token that only exists in a signed-in browser session, where an operator would copy it out of
  developer tools (a cookie, a `localStorage` or `sessionStorage` entry, or the `Authorization`
  header of a request the page made).

Two facts shape the design. The engine already owns the browser (ADR-004) and already enforces the
environment allowlist on every navigation and HTTP call (AGENTS.md 12.4), so it can read a token
from a session and refuse to send a credential to a host outside the allowlist. And configuration is
layered (ADR-011): some sections are team decisions that every machine must agree on, and some are
machine facts.

Options considered for how an agent authenticates a call: keep passing raw headers and rely on the
agent to source secrets; let the agent pass a secret's environment variable name and have the tool
substitute it; name a profile defined in configuration and let the engine do everything else.

## Decision

Authentication is described by **named profiles** in configuration, and an agent refers to a profile
**by name only**.

**Configuration.** A new top-level `apiAuth` section maps a profile name to a profile. An
environment may name a default profile. Profile types:

| Type                        | What the engine sends                                                                |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `none`                      | Nothing; states explicitly that the API is open.                                     |
| `basic`                     | `Authorization: Basic` built from a username and a password variable.                |
| `bearer`                    | `Authorization: Bearer` from a token variable.                                       |
| `api-key`                   | A key variable as a header or a query parameter, with a configurable name.           |
| `custom-headers`            | Fixed header names, each value read from its own variable.                           |
| `oauth2-client-credentials` | A token fetched from a token URL with a client id and secret variable, plus a scope. |
| `from-browser`              | A token read from a live browser session (below).                                    |

Every secret in a profile is the **name of a `QA_*` environment variable**, never a value. The
schema rejects a value that is not a variable name, so a literal secret cannot be written into
`config.yaml`. Non-secret parameters (header names, the token URL, the scope) are plain values.

**Where the profiles live.** `apiAuth` is a section the local layer may not set, and so is the
environment's default profile name. Which variable holds a credential, which token endpoint is
called and which header carries the token are decisions the whole team reviews; letting an override
file redirect them would be a quiet way to send a credential somewhere else. Each machine still
supplies its own secret values, because the variables are read from that machine's environment.

**Use.** `qa.http_execute` and the API runner take `auth: <profile name>`. A `headers` entry that
carries a credential (`Authorization`, `Cookie`, or a header or query name that any profile declares)
is rejected with a coded error whose remediation points at profiles. The engine resolves the profile
at request time and adds the credential itself.

**Secret handling.**

1. Resolved values live in engine memory only. An OAuth token or a browser-derived token is cached
   for the life of the process, until it expires or a request returns 401, and is never written to
   disk.
2. A resolved value is never returned to the agent: not in a tool result, an error message, a log
   line or an artifact. The agent learns only the profile name, its type and whether resolution
   succeeded.
3. Every resolved value is registered with the redactor for the process, and every configured header
   and query-parameter name is redacted by name. Request URLs and response headers and bodies are
   scrubbed by exact value and by name before they are stored as evidence, so a response that echoes
   a token, or a `Set-Cookie` header, does not leak it. The secret scan of evidence stays as the
   safety net behind this, not the mechanism.
4. A missing variable fails with a coded error naming the variable, never its value, and the case is
   reported `blocked`, not `failed` (AGENTS.md 12.5).

**Where a credential may go.** A credential is attached only to a request whose URL passes the
environment's allowlist, the same unconditional check as any other call. An OAuth token URL is
checked against the allowlist too. The token request is fixed by configuration (URL, form fields,
scope) and is not shaped by the agent, so it is permitted from any call that resolves a profile;
this does not reopen the safe-mode rules of exploration and pick mode, and ADR-009 is unaffected.

**Token from the browser session.** The `from-browser` profile names a source the engine reads from
a live session, the way an operator would in developer tools: a cookie, a `localStorage` key with an
optional JSON path, a `sessionStorage` key, or the `Authorization` header of an observed request to
an allowlisted host. The caller names where to read from: the id of an open engine browser session
of the same environment (opened by `qa.browser_open`, or attached to the operator's own browser by
`qa.browser_attach`), or a configured identity with a saved storage state (which an attached browser
can also produce). The token stays in
engine memory, is read again at request time on every call (it is never cached, so a token the
application rotated is picked up immediately and there is no stale copy for a 401 to expose), and
follows rules 1 to 4 above. A source
that the session cannot provide (for example `sessionStorage` from a saved storage-state file) fails
with a coded error rather than falling back silently. This complements the manual path, where the
operator copies a token into a `QA_*` variable used by a `bearer` profile.

**Attaching to the operator's browser.** For an application the engine cannot sign into itself (SSO,
MFA), `qa.browser_attach` connects over CDP to a Chrome the operator started with
`--remote-debugging-port` and signed in with, and registers it as a browser session, so all four
sources can be read live. A debugging port is full control of a browser and everything it is signed
into, so the endpoint must be loopback (`localhost`, `127.0.0.0/8`, `::1`); anything else is refused
before a connection is made. The session drives one page, the first open page already on the
environment allowlist, and safe mode, the allowlist and request-header observation are installed on
that page only, never on the operator's other tabs. Tabs opened later are not adopted, since they
may be the operator's own. Closing the session disconnects and never closes the operator's browser
or its context. Request headers are observed only from the moment of attachment, and the result
says so.

**Out of scope.** Interactive browser OAuth flows (authorization code, with a consent screen) and
mTLS. Both can be added later as new profile types without changing this model.

## Consequences

An agent can call a protected API, and a generated API spec can authenticate, without any credential
passing through a tool argument or appearing in a transcript. Adding an authentication scheme means
adding a profile type, not teaching every tool about secrets.

The protection depends on the engine being the only party that builds authenticated requests. It is
enforced by rejecting credential-bearing `headers`, not by asking the agent to behave. An agent with
shell access can still call an API with a secret of its own; profiles remove the need to, not the
ability to.

Redaction by exact value cannot catch a token that a response transforms (encoded, split or
hashed). The evidence secret scan is the second line of defence, and its limits are the same as
today's.

Each enforcement point below has to be tested on every path that can reach it, per AGENTS.md 12.7,
not only the obvious one: credential-header rejection in `qa.http_execute` and in the API runner;
the allowlist check on the request URL and on the token URL; redaction of URL, response headers and
body; the process-memory-only guarantee; and the environment check on a session that supplies a browser-derived token.

Rejected alternatives:

- **Keep raw `headers` and tell the agent to read secrets from the environment**: a prose rule, not a
  control (AGENTS.md 12.1); the value still crosses the tool boundary.
- **Let the agent pass a variable name and have the tool substitute it**: the value stays out of the
  call, but the agent still chooses which secret goes to which header and host, and the
  scheme-specific logic (token refresh, query placement, browser reads) has nowhere to live.
- **Secrets stored in `config.yaml` or the local layer**: a committed or git-ignored file of
  credentials is a leak waiting for a mistake; environment variables and the live browser session are
  where credentials already are.
- **Integration with an OS keychain or a secrets manager**: useful, but a per-platform dependency and
  a second source of truth; it can be added later as another way to fill the same variable.
