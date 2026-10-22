# Configuring and exploring

Recipes for pointing QA-AI-STLC at a real application: how configuration is layered, what to set
for applications that do not fit the defaults, and how to make exploration reach every element. For
installation and a first run, see [How to install and run](how-to-install-and-run.md).

## Configuration layers

`.qa/config.yaml` is committed and every machine reads the same one. A second, optional layer,
`.qa/config.local.yaml` or the file the `QA_CONFIG_LOCAL` environment variable names, lets one
operator or one CI runner point at its own server, identity, source checkout or parallelism budget
without touching the committed file. `qa init` adds `/config.local.yaml` to `.qa/.gitignore` and
writes a commented `config.local.yaml.example` showing the syntax; copy the lines you need into a
real `config.local.yaml`.

Only `environments`, `identities`, `source` and `agents` may be set locally. Everything that feeds a
gate, a hash or generated code (`testing`, `selectors`, `data`, `api`, `flaky`, `evidence`) stays
committed-only, so two machines never produce different pipeline results from the same artifacts.
Objects merge key by key; arrays and scalars replace. If the local layer widens an environment's
allowlist or sets `tlsInsecure: true`, every command that loads the configuration, including
`qa doctor`, prints a warning naming exactly what changed and which file did it:

```
warning: CONFIG_RELAXATION .qa/config.local.yaml adds "localhost" to the allowlist of environment "dev", which .qa/config.yaml does not list
```

`qa config show --explain` (or the `qa.config_show` MCP tool) prints the effective configuration with
the source of every value (`.qa/config.yaml`, the local layer, or a schema default) and every
relaxation. See [ADR-0011](../adr/0011-layered-project-configuration.md).

## Applications that open their session with a POST

Safe mode aborts every request an exploration makes that is not a safe read (`GET`, `HEAD`,
`OPTIONS` or `QUERY`). An application that gets its access token with `POST /auth/refresh-token` on
every load therefore never starts, and `qa explore` finds nothing past its sign-in page. List the
request in the environment, in the committed `.qa/config.yaml`:

```yaml
environments:
  staging:
    baseUrl: https://staging.example.com
    allowlist: [staging.example.com]
    safeNonGetRequests:
      - method: POST
        path: /auth/refresh-token
        reason: Exchanges the refresh cookie for an access token; creates no record.
```

or `qa config add environment staging ... --allow-request "POST /auth/refresh-token"
--allow-request-reason "..."`. The entry is narrow on purpose: `POST` only, an exact path (no query,
no pattern), a written reason, and only on a host the allowlist already permits. Every other request
that is not a safe read is still blocked. `qa explore` and `qa.browser_close` list what was let
through and what was blocked, by method and path, so an application that stalls shows which request
it was waiting for. Each blocked request carries its reason: its method (the only kind this list can
answer), or its host, scheme or port when it left the environment's allowlist or `baseUrl`. An entry
added only by the local layer is reported as a relaxation, and no MCP tool can add one. See
[ADR-0014](../adr/0014-environment-allowlist-for-safe-non-get-requests.md).

## Applications whose API is on another port

An allowlist entry that is a bare host name admits that host on the port of `baseUrl` only. An
application served from `http://localhost:4200` that reads its data from `http://localhost:8091` is
therefore explored without its data: every call to the API is blocked, and `qa explore` reports
them as blocked for their `port`. Name the second port in the environment's allowlist:

```yaml
environments:
  local:
    baseUrl: http://localhost:4200
    allowlist: [localhost, localhost:8091]
```

or `qa config add environment local --base-url http://localhost:4200 --allowlist localhost,localhost:8091`.
`host:port` admits that host on exactly that port; list the application's own host as well, since a
port entry does not admit the port of `baseUrl`. The scheme of `baseUrl` still applies to every
entry. An entry is a decision about where the engine may send requests, so no MCP tool can add one
(`qa.config_add` refuses it), and one that only the local layer adds is reported as a relaxation.
See [ADR-0019](../adr/0019-allowlist-entries-may-name-a-port.md).

## Multilingual applications

Without a setting, the browser asks the application for the language of the machine running the
engine, so the same project can produce a registry in Spanish on one machine and in English on
another, with different element names and text locators. Pin the language per environment with a
BCP 47 tag:

```yaml
environments:
  staging:
    baseUrl: https://staging.example.com
    allowlist: [staging.example.com]
    locale: en-US
```

or `qa config add environment staging ... --locale en-US`. Exploring, picking, the interactive
browser session, signing in, and running or verifying a spec all use it. Element names keep accented
and non-Latin letters: a Latin accent folds into its base letter ("Iniciar sesión" gives
`iniciarSesion`), and a name in another script keeps its letters.

## Several environments in one project

The selector registry (`.qa/selectors/registry.json`) and the API surface (`endpoints.json`) hold
every environment of the project, and each element and endpoint names the environment it was found
in. `qa explore --environment public` replaces, deprecates and counts only the elements of `public`
and leaves those of `local` as they were; the summary says how many it left. `--verify`,
`qa api-diff` and generation read one environment's elements too, so name the environment when the
project has more than one. A registry written before the field existed needs no migration: an
element is read as belonging to the environment whose `baseUrl` and allowlist admit its page, and is
recorded under it the next time that environment is explored. See
[ADR-0020](../adr/0020-registry-elements-name-their-environment.md).

## Pages the crawl cannot reach

Pass the pages to start from with `qa explore --url <url-or-path>` (repeatable, each on the
environment allowlist). A single-page application often moves between pages with buttons that carry
no link: `--probe-navigation` clicks buttons outside forms, each in a throwaway context under safe
mode, and keeps the page a click led to (it also clicks `role="button"` elements; a bare `div`, an
anchor without `href` and a button inside a form are skipped). The route map records how each route
was found. See [ADR-0015](../adr/0015-navigation-probing-clicks-controls-in-isolated-contexts.md).

## Controls hidden in a collapsed panel

A filter inside a "Search Details" panel is not in the page until the panel opens.
`qa explore --expand-collapsed` opens each page's `aria-expanded="false"` panels (not links, submit
buttons or pop-up triggers) in a throwaway context under safe mode and registers what appears, and
`--verify` reopens them so those controls still resolve. Sortable headers and status chips that
carry the test id are registered as `element` entries without the flag. See
[ADR-0017](../adr/0017-exploration-opens-collapsed-panels-in-discarded-contexts.md).

## Pick mode

When a crawl cannot reach an element (behind a multi-step flow, a modal, a canvas widget), record it
by hand: `qa explore --pick <url>` opens the page in a visible window, lets you click the element,
and writes a registry entry with `"source": "manual"`: the same schema and the same locator
generation, labelled as not crawler-discovered. To open a collapsed panel or menu first, switch
"Browse" on in the overlay, click, then switch it off. Pick mode is CLI-only: it needs a person at
the window, which nothing can drive over MCP.

## Catching a stale selector

`qa explore --verify` re-checks every stored primary locator against the live page without
re-crawling. With the demo app's "Apply" filter button renamed from `data-testid="apply-filter"` to
`apply-filter-renamed` on the live page but not yet re-crawled:

```
Verified selectors/registry.json: 78 element(s) checked.
1 degraded selector(s):
  e4fdfc0102d95678698c91fff17367185e23560634c6d531cf896bdcf554f65b: 1 -> 0
```

The exit code is non-zero, so this works as a CI gate. See [CI usage](ci-usage.md).

## Static source analysis

`qa explore --static` (with `source.path` set in `config.yaml`) merges a lightweight scan of your
source into the same registry: elements a crawl alone would miss, and every field with no
`data-testid`, `aria-label` or `role` to name it, recorded in `.qa/selectors/missing-test-ids.json`
with its file and line. Against the demo app's unmodified views, 26 of its 105 elements have no
locator candidate at all: a login form and a "new task" form, neither with a `data-testid` on any
field, a deliberately catalogued gap.

Static route extraction for React Router, Vue Router and Angular route configs is available as a
library function, not yet as a CLI flag:

```ts
import { analyzeStaticRoutes } from '@qa-ai-stlc/explorer';

const { routes } = analyzeStaticRoutes({
  files: [
    {
      filePath: 'src/App.tsx',
      content:
        '<Routes>\n  <Route path="/dashboard" element={<Dashboard />}>\n    <Route path="/dashboard/tasks" element={<Tasks />} />\n  </Route>\n</Routes>',
    },
  ],
});
```

```json
[
  { "path": "/dashboard", "filePath": "src/App.tsx", "line": 2 },
  { "path": "/dashboard/tasks", "filePath": "src/App.tsx", "line": 3 }
]
```
