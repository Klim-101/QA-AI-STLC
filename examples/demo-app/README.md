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
- 19 catalogued bugs spanning functional, accessibility and security categories (see
  `bugs.json`), each pointing at the file and route where it lives.

## Fake OAuth2 server

For the API-auth tests the app also serves a fake OAuth2 client-credentials endpoint (not one of the
catalogued bugs): `POST /oauth/token` (client `demo-client` / `demo-secret`), `GET /api/whoami` (bearer
protected, echoes the token), `POST /oauth/revoke-all`, `GET /oauth/issued` and `GET /oauth/demo-token`. The page `/token-demo.html` keeps a
token in a cookie, localStorage and sessionStorage and calls `/api/whoami` with it, for the
`from-browser` auth profile tests. `DEMO_TOKEN_TTL_SECONDS`
sets the token lifetime (default 3600).

## Kendo UI for jQuery fixture

`/kendo-jquery.html` exercises component-library support (P6-37, P6-40): a TabStrip, DropDownList,
ComboBox, MultiSelect, DatePicker, NumericTextBox and a modal Window from Kendo UI Core, plus two
grids (paged, and virtual scrolling) fed by `GET /api/kendo/people`. Kendo UI Core has no Grid, so
the grids are plain DOM written for this fixture; they use Kendo-style roles and class names but
no Kendo code. BUG-013 to BUG-016 live here.

Kendo UI Core (Apache-2.0), its theme (Apache-2.0) and jQuery (MIT) are dev dependencies served
from `node_modules` under `/vendor/`; nothing is copied into the repository or shipped. They are
pinned to a Kendo UI Core release that bundles its own drawing code: later releases require the
commercially licensed `@progress/kendo-drawing`, which the license policy does not allow.

## Kendo UI for Angular structure fixture

Kendo UI for Angular is commercially licensed, so `/kendo-angular.html` reproduces the rendered
structure of the same widget set without using or copying its code: custom `kendo-*` host elements,
ids generated per page load, popups attached to `body` and linked to their widget by
`aria-controls`, a tab strip, a modal window, and a paged and a virtual-scrolling grid fed by
`GET /api/kendo/people`. It is plain script written from first principles, so its structure is a
best reconstruction: P6-46 checks it against a real application. BUG-017 to BUG-019 live here.

## Busy indicator fixture

`/busy-fixture.html` (P6-42) shows a `.k-loading-mask` for a short time after load while its Save button
ignores clicks; `?hold=1` keeps the mask forever. It exists to prove engine browser actions wait for
busy indicators and fail with a coded error when one never clears.

## Tests

`npm test --workspace @qa-ai-stlc/demo-app` runs a smoke suite (`src/server.test.ts`) covering the
happy paths (login, navigation, role checks that do work) and reproductions of each catalogued
bug, so a change that accidentally "fixes" one is caught before later tests start relying on the
old behavior.
