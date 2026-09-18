# @qa-ai-stlc/cli

The `qa` command: a thin client over `@qa-ai-stlc/core` and `@qa-ai-stlc/explorer` for CI and
humans. `qa init` creates the `.qa/` store and runs the testing scope survey; `qa doctor` checks
Node, browsers, identities and environment reachability before a run; `qa explore` crawls the
configured environment, optionally merges static source analysis (`--static`) and pick-mode
entries (`--pick <url>`), and writes the selector registry and a generated locator module;
`qa explore --verify` re-checks stored selectors against the live page without re-crawling.
`qa config set testing.<type> <value>` changes a scope decision after `init`; `qa config add
environment <name> --base-url <url> --allowlist <a,b,c>` and `qa config add identity <name> --auth
<cdp-attach|storage-state> --secret <QA_...> [--login-url <url>] [--username <user>]` add a
schema-validated entry instead of hand-editing `config.yaml`. Every command supports `--json` for
machine-readable output and exits non-zero on failure.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
