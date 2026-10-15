---
'@qa-ai-stlc/core': patch
'@qa-ai-stlc/mcp-server': patch
---

Three problems at the start of a session. `qa.config_show` failed with a bare schema error for any configuration that lists `safeNonGetRequests`, because the report only accepted a few list shapes; it now reports any list of records, and a value it still cannot report fails with `CONFIG_SHOW_VALUE_UNSUPPORTED`, naming the field and a remediation. `qa.doctor` no longer fails for Firefox or WebKit being absent: the engine launches only Chromium, so only Chromium is checked, and `qa doctor --fix` installs only that. The MCP server answers `--version` without serving, so `npx -y @qa-ai-stlc/mcp-server@<version> --version` warms the cache before the first session; a cold `npx` download can outlast the 30 seconds Claude Code waits for a server to connect (the server needs about five seconds to start once cached), and the install guide and `qa-start` now say so.
