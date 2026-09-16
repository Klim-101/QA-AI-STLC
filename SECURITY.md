# Security Policy

## Supported versions

The project is pre-alpha and has no stable release. Security fixes are applied to `main` and to the latest published version once releases begin.

| Version        | Supported |
| -------------- | --------- |
| Latest release | Yes       |
| Older releases | No        |

## Reporting a vulnerability

Do not open a public issue, discussion or pull request for a vulnerability.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**.

Include:

- affected version or commit;
- host (Claude Code or Codex, CLI or desktop) and operating system;
- a description of the issue and its impact;
- steps to reproduce or a proof of concept, with all secrets and personal data removed.

## What to expect

- Acknowledgement within 7 days.
- An initial assessment within 14 days.
- Coordinated disclosure: a fix and advisory are published before details are made public. Credit is given unless you prefer otherwise.

The project is maintained by volunteers, so these are goals rather than guarantees.

## Scope

In scope:

- the engine, CLI and local MCP server;
- generated plugins and extensions;
- leakage of secrets, cookies, storage state or personal data into artifacts, evidence or logs;
- bypass of the domain allowlist, safe mode, approval gates or evidence integrity;
- prompt injection from an application under test that causes actions outside the configured allowlist or safe mode.

Out of scope:

- vulnerabilities in agent hosts, models, Playwright or browsers themselves; report those to their vendors;
- issues in the application you are testing;
- findings that require a compromised local machine or a malicious project configuration written by the user.
