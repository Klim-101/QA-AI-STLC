---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/mcp-server': minor
---

The MCP server reads the project root from `QA_PROJECT_ROOT` when it is set (an absolute path to an existing directory, otherwise `PROJECT_ROOT_INVALID`). A server started inside its plugin's install directory (`PLUGIN_ROOT`), as Codex does for a plugin-declared server, now fails with `PROJECT_ROOT_UNRESOLVED` and a remediation instead of acting on that directory.
