# Drafting the security audit authorization

The authorization is a JSON file you write and the engine validates (`SecurityAuthorizationSchema`).
It states exactly what the audit may do. The operator approves its exact content; the audit then
runs inside it and refuses anything it does not allow.

```json
{
  "schemaVersion": 1,
  "environment": {
    "name": "staging",
    "baseUrl": "https://staging.example.com/",
    "allowlist": ["staging.example.com"]
  },
  "checks": ["headers", "cookies", "authz"],
  "identities": [
    { "name": "member", "role": "low" },
    { "name": "admin", "role": "high" }
  ],
  "prohibitedActions": ["brute force", "denial of service", "changing data outside the allowed mutations"],
  "allowedMutations": [],
  "restrictedRoutes": ["/admin/users"],
  "logoutPath": "/logout",
  "rateLimit": { "requestsPerSecond": 2, "maxRequests": 200 },
  "createdAt": "2026-10-14T10:00:00Z"
}
```

- **environment**: copy `name`, `baseUrl` and `allowlist` from `qa.config_show` exactly. A difference
  is refused, and a later change to them withdraws the approval.
- **checks**: any of these, once each. Black-box (they send requests to the running application):
  - `headers`: security headers of the landing page;
  - `cookies`: cookie flags (`Secure`, `HttpOnly`, `SameSite`);
  - `cors`: cross-origin policy;
  - `csrf`: whether a state-changing request is accepted without a token (needs an allowed mutation);
  - `authz`: whether the `low` identity reaches what only the `high` one should (needs both roles and
    `restrictedRoutes`);
  - `session`: session lifecycle, including what happens after logout (needs `logoutPath`);
  - `encoding`: input validation and output encoding;
  - `errors`: error payloads that leak internals.

  Code-assisted (they read the source checkout configured as `source.path`, and are skipped with a
  notice when there is none): `dependencies`, `secrets`, `configuration`. Naming `dependencies` also
  lets the audit send package names and versions to the package registry. Include a class only when
  the operator asked for it.

- **identities**: names of identities already in the configuration (`qa.config_show`), each `low`
  or `high`. The audit signs in as them through the identity mechanism; you never see a credential.
- **prohibitedActions**: at least one. Always list brute force and denial of service, and anything
  else the operator ruled out.
- **allowedMutations**: empty unless the operator names a side effect. Each is an exact method
  (`POST`, `PUT`, `PATCH`, `DELETE`) and path with a reason; a `body` the operator vouches for as
  harmless (a record carrying the project's owner marker) is what makes the CSRF check conclusive.
  Without one the check can only be `uncertain`.
- **restrictedRoutes**: paths the `low` identity must not reach (`authz`).
- **rateLimit**: start low (a couple of requests a second, a few hundred in all). When the budget
  runs out the audit stops and reports `partial`; a bigger budget is a new authorization.
