---
'@qa-ai-stlc/core': minor
'@qa-ai-stlc/cli': minor
'@qa-ai-stlc/mcp-server': minor
---

The agent can now set up API authentication without the operator editing `config.yaml`. `qa.config_add_api_auth` (and `qa config add api-auth <name> --profile <json> [--default-for <environment>]`) adds an `apiAuth` profile and an environment default, validated by the same schema; a secret is only ever the name of a `QA_` variable, so a token value is refused. `qa.browser_discover_api_auth` reads an open, signed-in session and reports which request header carries the bearer token and which cookie, localStorage or sessionStorage key stores it, as names only, with a proposed `from-browser` profile. For this, a session now keeps in memory the latest `Authorization` and bearer-valued request headers sent to allowlisted hosts; they are never returned or logged. `qa-execute` says to use these instead of asking the operator for YAML.
