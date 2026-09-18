---
'@qa-ai-stlc/cli': minor
---

Add `qa config add environment <name> --base-url <url> --allowlist <a,b,c>` and `qa config add identity <name> --auth <cdp-attach|storage-state> --secret <QA_...> [--login-url <url>] [--username <user>]`. Both validate the new entry against its schema before writing, refuse to overwrite an existing name unless `--force` is passed, and edit `config.yaml` in place (same technique as `qa config set`) so existing comments and formatting survive — no more hand-editing YAML to add an environment or identity.
