# @qa-ai-stlc/test-utils

Shared test helpers for this monorepo's own test suites: golden-file assertions
(`expectMatchesGoldenFile`) and a self-cleaning temporary directory (`withTempDir`) that never
touches the developer's home directory or real host configuration (AGENTS.md section 13).

Private and never published — every other package depends on it only as a `devDependency`.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
