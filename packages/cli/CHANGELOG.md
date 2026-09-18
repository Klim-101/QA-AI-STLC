# @qa-ai-stlc/cli

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
