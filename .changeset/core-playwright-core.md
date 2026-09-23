---
'@qa-ai-stlc/core': patch
---

Reduces install time for `@qa-ai-stlc/mcp-server` and every consumer of `@qa-ai-stlc/core` (#333):
`core` now depends on `playwright-core` instead of the full `playwright` package for its browser
launcher and reachability checks. `qa doctor --fix` (`installBrowsers`), the only feature that
needed the full package's installer CLI, now fetches it on demand via `npx playwright install`
instead of requiring it as a permanent dependency — behavior is unchanged, but a real operator's
first `npx -y @qa-ai-stlc/mcp-server` no longer pays for a package it may never use. `core`'s
`nodeProcessRunner` (the `ProcessRunner` port's default implementation, used by `installBrowsers`
and available to any future caller) now spawns via `cross-spawn` instead of `node:child_process`
directly, so it can safely invoke a Windows `.cmd`/`.bat` shim like `npx` without `shell: true`.
