# ADR-007: Engine and plugin share one version

Status: Accepted
Date: 2026-09-16

## Context

Distributing the framework through multiple channels (npm, a Claude Code plugin, a Codex plugin) creates a risk that a plugin references an engine version other than the one it was built and tested against. If the runtime were bundled inside each plugin separately, three copies of the same engine could drift independently, each fixed at a different point in time, with no mechanism to notice.

## Decision

The engine ships as a single npm package. Plugins do not bundle a copy of it; they carry an `.mcp.json` entry that starts the pinned engine version locally (`npx -y <scope>/<package>@<version>`). Plugin generation stamps the same version from the root `package.json` into the plugin manifest. At MCP server start, the running engine version is compared against the version the plugin expects, and a mismatch produces a clear error rather than silently running whatever version happened to be cached.

## Consequences

There is exactly one engine artifact to test, version and audit, regardless of how many distribution channels exist. A security fix or a bug fix in the engine reaches every channel the moment a user's plugin next starts the pinned version, without a separate rebuild-and-republish step per plugin. Version mismatches are loud and specific instead of manifesting as unexplained behavioral differences between hosts.

The cost is a runtime dependency on `npx` being able to fetch the pinned package at plugin-start time, which assumes network access on first use (subsequent starts use the local cache). This was accepted over bundling the runtime inside each plugin, which was tried in the reference implementation this project learns from and produced exactly the read-only-cache, path-with-spaces, and platform-quarantine problems this decision avoids by not bundling at all.
