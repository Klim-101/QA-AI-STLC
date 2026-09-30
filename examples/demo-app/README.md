# @qa-ai-stlc/demo-app

A small server-rendered task tracker used to validate the explorer, runners and generated tests
against a real, running application. Every intentional defect is catalogued in
[`bugs.json`](./bugs.json) — do not fix one without removing or updating its entry there, since
later E2E and runner tests are written against these bugs staying present.

Private, never published (AGENTS.md section 11).

## Run it

```sh
npm install
npm start --workspace @qa-ai-stlc/demo-app
```

The app listens on `http://localhost:4310` (override with `DEMO_APP_PORT`).

## What's in it

- Session-based login with two roles: `admin@example.com` / `admin123` and
  `employee@example.com` / `employee123`.
- A dashboard, a task table with a status filter and a sort link, a new-task form, a task detail
  page with an edit `<dialog>`, and an admin-only user list.
- 12 catalogued bugs spanning functional, accessibility and security categories (see
  `bugs.json`), each pointing at the file and route where it lives.

## Fake OAuth2 server

For the API-auth tests the app also serves a fake OAuth2 client-credentials endpoint (not one of the
catalogued bugs): `POST /oauth/token` (client `demo-client` / `demo-secret`), `GET /api/whoami` (bearer
protected, echoes the token), `POST /oauth/revoke-all` and `GET /oauth/issued`. `DEMO_TOKEN_TTL_SECONDS`
sets the token lifetime (default 3600).

## Tests

`npm test --workspace @qa-ai-stlc/demo-app` runs a smoke suite (`src/server.test.ts`) covering the
happy paths (login, navigation, role checks that do work) and reproductions of each catalogued
bug, so a change that accidentally "fixes" one is caught before later tests start relying on the
old behavior.
