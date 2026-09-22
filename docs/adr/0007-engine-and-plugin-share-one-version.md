# ADR-007: Engine and plugin share one version

Status: Accepted
Date: 2026-09-16

## Context

Distributing the framework through multiple channels (npm, a Claude Code plugin, a Codex plugin) creates a risk that a plugin references an engine version other than the one it was built and tested against. If the runtime were bundled inside each plugin separately, three copies of the same engine could drift independently, each fixed at a different point in time, with no mechanism to notice.

## Decision

The engine is five independently versioned npm packages (`schemas`, `core`, `explorer`, `cli`, `mcp-server` — changesets' `fixed`/`linked` groups are both empty, so each bumps on its own release). Plugins do not bundle a copy of any of them; they carry an `.mcp.json` entry that starts the pinned `mcp-server` package locally (`npx -y <scope>/<package>@<version>`), since that is the one package `.mcp.json` actually launches. Plugin generation stamps `packages/mcp-server/package.json`'s version into the plugin manifest, not the root `package.json` (a private, unpublished `0.0.0` placeholder that is never itself versioned or released). At MCP server start, the running `mcp-server` version is compared against the version the plugin expects (P2-12), and a mismatch produces a clear error rather than silently running whatever version happened to be cached.

## Consequences

There is exactly one package, `mcp-server`, that a plugin ever pins and version-checks, regardless of how many distribution channels exist — no per-channel copy to drift independently. A security fix or a bug fix in `mcp-server` (or a package it depends on, via a version bump) reaches every channel the moment a user's plugin next starts the pinned version, without a separate rebuild-and-republish step per plugin. Version mismatches are loud and specific instead of manifesting as unexplained behavioral differences between hosts.

The cost is a runtime dependency on `npx` being able to fetch the pinned package at plugin-start time, which assumes network access on first use (subsequent starts use the local cache). This was accepted over bundling the runtime inside each plugin, which was tried in the reference implementation this project learns from and produced exactly the read-only-cache, path-with-spaces, and platform-quarantine problems this decision avoids by not bundling at all.
