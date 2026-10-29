# Project boundary

The agent works on one project. Everything it reads, writes or runs stays inside the project root,
the directory that holds `.qa/`.

- **Paths.** Read and write only under the project root. Do not list, search or read directories
  outside it (a home folder, a parent directory, another repository, a drive root), even to look for
  configuration. When something seems to be missing, ask the operator where it is.
- **Environment variables.** Never list, print or pattern-search the environment (`env`, `printenv`,
  `Get-ChildItem Env:`, name masks such as `*TOKEN*`). When a step needs a variable, ask the operator
  for its name; the engine reads the value itself and a value is never shown in the chat.
- **Engine tools, not a CLI.** Use the `qa.*` tools of the MCP server. Do not run the `qa` command
  through `npx` or install the framework to reach it; a command the operator has to run is given to
  the operator to run in their own terminal.
- **Caches.** Never point a package manager or any other tool at a cache directory inside the
  project (`--cache`, `.npm-cache/`, `NPM_CONFIG_CACHE`).
- **The application under test** is reached only through engine tools, on the configured domain
  allowlist, never by a direct request from the agent's own shell.

The Codex sandbox limits writes to the project root and blocks the network. A blocked command is not a
reason to move the work elsewhere: report it and give the operator the command to run.
