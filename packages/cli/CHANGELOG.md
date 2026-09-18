# @qa-ai-stlc/cli

## 0.4.0

### Minor Changes

- baeee88: Add `qa config add environment <name> --base-url <url> --allowlist <a,b,c>` and `qa config add identity <name> --auth <cdp-attach|storage-state> --secret <QA_...> [--login-url <url>] [--username <user>]`. Both validate the new entry against its schema before writing, refuse to overwrite an existing name unless `--force` is passed, and edit `config.yaml` in place (same technique as `qa config set`) so existing comments and formatting survive — no more hand-editing YAML to add an environment or identity.

## 0.3.0

### Minor Changes

- 524a9c8: `qa init` now runs the testing scope survey (development plan section 2.7): Web E2E, API, accessibility and security are answered independently with `--e2e`, `--api`, `--a11y` and `--security` (each `in-scope` or `out-of-scope`), plus optional `--source-path` and, when API is in scope, `--api-source`. `qa init` refuses to finish with a type left `undecided` unless `--defer-scope` is passed, so a project never silently starts with a scope nobody decided.

  Add `qa config set testing.<type> <in-scope|out-of-scope|undecided>` to change one testing type's scope decision later, preserving the rest of `config.yaml` (including comments and formatting).

  `qa doctor` gains two checks: `source-path` (is `source.path` readable) and `api-contract` (is `api.source` reachable — over HTTP for a URL, on disk for a local file; `"discover"`/`"synthesize"` are not checked, since neither is a file or a URL).

  `@qa-ai-stlc/core` exports the two new doctor checks, `checkSourcePathReadable()` and `checkApiContractReadable()`.

### Patch Changes

- bc12efc: Fix a crash in `qa doctor` (and every other command) on Windows: the bin entry point called `process.exit()` immediately after `runCli()` resolved, which could crash the whole process with a libuv assertion ("`UV_HANDLE_CLOSING`") when a real `fetch()` call — `qa doctor`'s environment reachability check — had just run, because undici's keep-alive socket handle had not finished closing when the forced exit tore down the event loop. The bin entry point now sets `process.exitCode` instead, letting Node drain the event loop naturally before exiting.
- Updated dependencies [524a9c8]
  - @qa-ai-stlc/core@0.5.0
  - @qa-ai-stlc/explorer@0.6.1

## 0.2.1

### Patch Changes

- Updated dependencies [143e889]
  - @qa-ai-stlc/explorer@0.6.0
  - @qa-ai-stlc/schemas@0.6.0
  - @qa-ai-stlc/core@0.4.1

## 0.2.0

### Minor Changes

- f301cb4: Add the `qa explore` command to `@qa-ai-stlc/cli`: crawls the configured environment, synthesizes and scores locator candidates, and writes `.qa/selectors/registry.json`, `.qa/selectors/missing-test-ids.json` and the generated `tests/qa/locators.ts`, registering all three in the manifest. `--static` merges in static source analysis findings when `source.path` is configured; `--pick <url>` runs a manual pick-mode session against one page instead of crawling. `--verify` re-checks every stored, non-deprecated element's primary candidate against the live page it was found on and exits non-zero when one no longer resolves as well as it did when last recorded — the signal a stale selector (for example a renamed test ID) needs.

  `@qa-ai-stlc/schemas`'s `SelectorElementSchema` gains an optional `pageUrl`, recorded by a `crawl`/`manual` entry so `qa explore --verify` knows which live page to re-check a stored element's candidates against.

  `@qa-ai-stlc/core`'s `FileSystem` port gains `listFiles()`, listing every regular file under a directory tree recursively; `qa explore --static` uses it to discover source files to scan.

### Patch Changes

- Updated dependencies [f301cb4]
  - @qa-ai-stlc/core@0.4.0
  - @qa-ai-stlc/explorer@0.5.1
  - @qa-ai-stlc/schemas@0.5.0

## 0.1.4

### Patch Changes

- Updated dependencies [3bb0f18]
- Updated dependencies [99ddeb2]
  - @qa-ai-stlc/schemas@0.4.0
  - @qa-ai-stlc/core@0.3.0

## 0.1.3

### Patch Changes

- Updated dependencies [033e9a1]
  - @qa-ai-stlc/schemas@0.3.0
  - @qa-ai-stlc/core@0.2.1

## 0.1.2

### Patch Changes

- Updated dependencies [27866c6]
  - @qa-ai-stlc/core@0.2.0
  - @qa-ai-stlc/schemas@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [823eb39]
  - @qa-ai-stlc/core@0.1.0
  - @qa-ai-stlc/schemas@0.1.0

## 0.1.0

### Minor Changes

- f610fdc: Add the `qa` CLI: `qa init` creates the `.qa/` store, a starting `config.yaml` and a `.gitignore`; `qa doctor` checks Node, browsers, identities and environment reachability, with `--fix` to install missing browsers. Every command supports `--json` output and exits non-zero on failure.
