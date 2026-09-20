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
schema-validated entry instead of hand-editing `config.yaml`. `qa scope --from file --path <path>`
or `qa scope --from text --content <text> --label <label>` extracts requirements (one per
level-2 Markdown heading) into `artifacts/scope.json`, upserting by requirement id on a repeated
call. `qa cases add --path <path>` validates a test case written as JSON — it must link to at
least one requirement, and every linked id must actually exist in `artifacts/scope.json` — and
registers it under `artifacts/cases/<id>.json`. `qa approve <gate> --artifact <path>
--approved-by <name> [--note <text>]` hash-binds an approval to a pipeline gate (`scope`, `cases`,
approved in order); `qa validate` recomputes every gate's status from the approval ledger and
re-checks every registered case's requirement links, exiting non-zero for a reopened gate or an
unlinked case. Every command supports `--json` for machine-readable output and exits non-zero on
failure.

Part of [QA-AI-STLC](https://github.com/Klim-101/QA-AI-STLC). See the repository root for
license, contributing and security information.
