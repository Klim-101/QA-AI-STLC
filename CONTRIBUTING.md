# Contributing to QA-AI-STLC

Thank you for helping. This guide covers what you need to open a good pull request. The full engineering rules, including code style, comments, naming and architecture boundaries, are in [AGENTS.md](AGENTS.md). They apply to human and AI-assisted contributions alike.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- For anything larger than a small fix, open an issue first so the approach can be agreed.
- Check the scope boundaries below. Pull requests outside them will be declined.
- Security issues go through [SECURITY.md](SECURITY.md), never through public issues.

## Scope boundaries

The project deliberately does **not** accept:

- calls to language models or dependencies on LLM SDKs; the model always comes from the user's agent host;
- hosted services, telemetry endpoints or required API keys;
- integrations that create or publish records in issue trackers, wikis or test management tools; publishing is the operator's responsibility;
- bundled third-party MCP servers.

## Development setup

Requirements: Node.js active LTS, pnpm, Git.

```sh
git clone https://github.com/Klim-101/QA-AI-STLC.git
cd QA-AI-STLC
pnpm install --frozen-lockfile
```

Local gate, required before every pull request:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm lint:generated
pnpm licenses:check
```

The repository is being bootstrapped, so some scripts may not exist yet. Run the ones that do and mention the rest in your pull request.

## Workflow

1. Create a branch from the latest `main`: `<type>/<issue-number>-<short-description>`, for example `fix/57-registry-hash-order`. Types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `chore`.
2. Keep the change focused on one concern and include tests.
3. Commit using [Conventional Commits](https://www.conventionalcommits.org/) and sign off every commit:

   ```sh
   git commit -s -m "fix(core): keep approval hash stable across line endings"
   ```

4. Add a changeset with `pnpm changeset` if users will notice the change.
5. Update documentation affected by the change, including `README.md` and this file.
6. Rebase on `main`, push, and open a pull request using the template.

Pull requests are squash-merged after CI passes on Windows, macOS and Linux and a maintainer approves.

## Licensing of contributions

The project is licensed under the [Apache License 2.0](LICENSE). Contributions are accepted under the same license, as described in section 5 of the license.

Every commit must carry a `Signed-off-by` line. It certifies the [Developer Certificate of Origin 1.1](https://developercertificate.org/): you wrote the contribution or otherwise have the right to submit it under the project license.

In particular:

- do not submit code owned by an employer or client without permission, or code covered by a confidentiality agreement;
- do not copy code from projects with licenses incompatible with Apache-2.0, such as GPL, AGPL or SSPL;
- new source files start with the license header:

  ```ts
  // Copyright The QA-AI-STLC Authors
  // SPDX-License-Identifier: Apache-2.0
  ```

- new dependencies must use a license from the allowlist in [AGENTS.md](AGENTS.md#93-third-party-code-and-dependencies);
- if you used AI tools, you are responsible for reviewing the output and confirming it does not reproduce incompatibly licensed code.

## Reporting bugs and requesting features

Use the issue forms. Remove secrets, tokens, cookies, internal hostnames and personal data from logs and screenshots before attaching them.
