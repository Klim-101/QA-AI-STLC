# AGENTS.md

Operating guide for humans and coding agents (Claude Code, Codex, Copilot and others) who develop QA-AI-STLC.

This file governs development of the framework. It is committed to the repository but is **not part of any distribution**: it must never be included in npm packages, plugins or extensions. Package `files` allowlists enforce this (see [Distribution hygiene](#11-distribution-hygiene)).

`CLAUDE.md` imports this file. Keep all rules here; do not duplicate them elsewhere.

---

## 1. Project in one paragraph

QA-AI-STLC is an open-source, TypeScript-first, model-agnostic QA framework. A deterministic engine (explorer, selector registry, evidence store, runners, pipeline state machine with hash-bound gates) is exposed through a CLI and a local stdio MCP server. A thin agent layer (skills, hub and spoke definitions) runs inside the user's own agent host, Claude Code or Codex, using the user's own subscription. The project runs no hosted services and makes no model calls.

## 2. Non-negotiable boundaries

Stop and ask the maintainer before any change that would cross one of these lines.

1. **No model calls.** No package depends on an LLM SDK (`@anthropic-ai/*`, `openai`, `ai`, `@google/genai`, `langchain`, and similar). All reasoning happens in the agent host.
2. **No hosted infrastructure.** No backend, telemetry endpoint, license server, model gateway or required API key.
3. **No issue-tracker or wiki integrations.** Creating and publishing defects and reports in Jira, Confluence, GitHub Issues or similar systems is the operator's responsibility. The framework produces tracker-neutral drafts only.
4. **No third-party MCP servers** shipped with or required by the framework.
5. **Engine owns the browser.** Agents interact with the application under test only through engine tools that register evidence. Evidence is never created by hand.
6. **JSON is canonical.** Artifacts are Zod-validated JSON; Markdown and HTML are rendered from JSON by the engine.
7. **Clean room.** Never copy code, text, names, identifiers, hostnames, ticket keys or examples from any employer or private project, including the previous internal framework. Re-implement designs from first principles.
8. **No secrets anywhere.** Not in code, fixtures, tests, snapshots, commit messages, issues or logs.

## 3. Repository map

| Path                  | Content                                                                                 | Editable          |
| --------------------- | --------------------------------------------------------------------------------------- | ----------------- |
| `packages/schemas`    | Zod schemas, generated JSON Schema, schema migrations                                   | Yes               |
| `packages/core`       | State machine, gates, `.qa/` store, evidence, runners, rendering                        | Yes               |
| `packages/explorer`   | Crawler, static analysis, pick mode, locator synthesis, registry, API-surface discovery | Yes               |
| `packages/cli`        | `qa` command                                                                            | Yes               |
| `packages/mcp-server` | Local stdio MCP server over the core API                                                | Yes               |
| `packages/runner-*`   | Runners behind the `Runner` interface: `runner-api`, `runner-a11y`, `runner-security`   | Yes               |
| `agents/`             | Canonical skills and agent definitions                                                  | Yes               |
| `adapters/*`          | Claude Code plugin, Codex plugin, VS Code extension                                     | **No, generated** |
| `examples/demo-app`   | Demo application with catalogued bugs                                                   | Yes               |
| `docs/dev/`           | Development plan and task breakdown, ignored by git                                     | Local only        |
| `docs/public/`        | Public roadmap and published documentation                                              | Yes               |
| `docs/adr/`           | Architecture decision records for hard-to-reverse decisions                             | Yes               |
| `.claude/rules/*`     | Claude-Code-only path-scoped rules, generated from this file's §5-7 (P0-18)             | **No, generated** |
| `.github/`            | Community health files, workflows, templates                                            | Yes               |

Generated trees are rebuilt with `npm run generate` and checked by `npm run lint:generated`. Never hand-edit them; change the source and regenerate.

Dependencies point downward only: `cli` and `mcp-server` depend on `core` and `explorer`; `core` and `explorer` depend on `schemas`; `schemas` depends on nothing internal.

## 4. Workflow for agents

1. Read this file and the relevant package `README.md` before editing.
2. Work on a branch (section 8). Never commit to `main`. Create the branch first, before the first
   edit — not right before the first commit. An edit started on `main` by habit (for example,
   right after a previous branch was deleted post-merge) is a real risk, not a formatting nit: move
   uncommitted work to a real branch (`git checkout -b` carries uncommitted changes) the moment it
   is noticed, before anything is committed.
3. Keep a change to one concern. Do not refactor unrelated code in the same change.
4. Write or update tests in the same change as the behavior. Unit-test the change directly; add an integration test in the package's `test/` directory when the change crosses a module boundary (filesystem, browser, CLI, MCP). Never merge a behavior change with only manual verification — coverage in CI (section 13) is the only accepted evidence.
5. Run the full local gate before declaring work done:

   ```sh
   npm ci
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   npm run lint:generated
   npm run licenses:check
   ```

   The repository is being bootstrapped. Until a script exists, run the checks that do exist and state which ones were unavailable.

   `npm run test`/`npm run typecheck` build every workspace dependency first (`pretest`/
   `pretypecheck`). Calling `vitest`/`tsc` directly on one package for a faster iteration loop skips
   that build step: a change to an exported symbol in `packages/schemas` or `packages/core` will not
   be visible to a consuming package's tests until it is rebuilt, and the failure that results
   (an import resolving to `undefined`) reads exactly like a real bug. Either use the `npm run`
   scripts, or rebuild the changed dependency's workspace first (`npm run build --workspace
<package>`), before trusting a direct `vitest`/`tsc` failure at face value.

6. Add a changeset (`npx changeset`) when behavior visible to users changes. This is the only manual step in the release process (section 8.4): do not bump a package version or run `npm publish` by hand.
7. Update documentation and community files affected by the change (section 10).
8. Report what was verified and what was not. Never claim a check passed if it was not run.
9. Do not push, open pull requests, publish packages, create tags or change repository settings unless the maintainer asked for it.
10. Track progress through GitHub, which is the single source of truth for task status:
    - Every roadmap task is an issue titled `[P<phase>-<nn>] ...` with the `roadmap` label, a phase milestone, `size:` and `area:` labels, and "blocked by" links for its dependencies.
    - Do not start a task while it has open "blocked by" issues. The board shows such tasks as `Todo`; startable tasks are `Ready`.
    - Start work by creating a branch `<type>/<issue-number>-<short-description>`. The board moves the issue to `In progress` automatically.
    - Open the pull request with `Closes #<issue-number>` in the description. The board moves the issue to `In review`, and merging closes it and moves it to `Done`. Write `Closes #<issue-number>` only on the pull request that actually does that issue's exit-criterion work. A pull request that merely records or documents a future task (for example, adding it to this file or to the task breakdown) must not close it — merging it would mark undone work `Done`.
    - Add the `blocked` label only for external blockers (a decision, a third party). Record the reason in an issue comment.
    - The progress table in `docs/public/ROADMAP.md` is regenerated from milestones by the `Roadmap sync` workflow. Edit the roadmap by hand only when phase scope or delivered capabilities change.
    - `docs/dev/task-breakdown.md` (local, git-ignored) holds the plan context, local-only tasks and the decisions log. Refresh its statuses with `node docs/dev/sync-breakdown.mjs --project <number>`; record scope-changing findings in its decisions log.
    - New tasks are added to the breakdown first, then created as issues with the next free ID. Never invent or reuse a task ID.

## 5. TypeScript code style

Tooling enforces most of this: TypeScript strict, ESLint with `typescript-eslint` strict and stylistic type-checked configs, Prettier. When a rule below is not enforced by tooling, it is still required.

### 5.1 Compiler and modules

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.
- ESM only, `module` and `moduleResolution` set to `NodeNext`. Relative imports end in `.js`.
- Node built-ins use the `node:` prefix: `import { readFile } from 'node:fs/promises'`.
- Supported Node: active LTS lines declared in `engines`. Do not use APIs newer than the lowest supported line.

### 5.2 Types

- No `any`. Use `unknown` and narrow. The rare justified exception needs an `eslint-disable-next-line` with a reason.
- No non-null assertions (`!`) except in tests.
- Zod schemas are the source of truth for data crossing a boundary (files, MCP input, CLI input, browser data). Derive types with `z.infer`; do not write a parallel interface.
- Use `type` for unions, mapped and derived types. Use `interface` for object contracts implemented by several modules (for example `Runner`).
- No TypeScript `enum`. Use string literal unions or `as const` objects.
- Prefer `readonly` properties and `ReadonlyArray` for values that are not mutated.
- Exhaustive `switch` over unions ends with an `assertNever(value)` default.
- Explicit return types on exported functions.

### 5.3 Modules and functions

- Named exports only. No default exports.
- One module, one responsibility. Split a file when it passes ~300 lines or mixes concerns.
- Functions do one thing. Prefer early returns over nested conditionals.
- Keep the core pure: filesystem, clock, process, browser and randomness are injected through small interfaces so logic is testable without I/O.
- No module-level mutable state. No side effects on import.
- No barrel files inside a package except the package entry point.

### 5.4 Errors

- Throw only `Error` subclasses. Expected failures use `QaError` with a stable machine-readable `code`, a human message and an optional `remediation`.
- Never swallow errors. A `catch` either handles the case meaningfully, adds context and rethrows (`{ cause }`), or converts to a `QaError`.
- `process.exit` is allowed only in the CLI entry point. Library code returns or throws.
- MCP tools return structured errors with `code` and `remediation` instead of stack traces.

### 5.5 Async

- `async`/`await` only; no raw `.then` chains.
- No floating promises (`@typescript-eslint/no-floating-promises`).
- Run independent work with `Promise.all`; bound concurrency for browser and filesystem fan-out.
- Every browser, network and child-process operation has a timeout and is cancellable through `AbortSignal`.

### 5.6 Cross-platform

- The framework runs on Windows, macOS and Linux. CI runs all three.
- Build paths with `node:path`. Paths written into artifacts are project-relative and use `/` (`path.posix`).
- Never build shell command strings. Spawn processes with argument arrays and `shell: false`.
- No shell-specific scripts. Repository scripts are Node scripts.
- Normalize line endings when hashing text.

### 5.7 Dependencies

- Add a dependency only when it removes real complexity. Prefer the Node standard library.
- Pin exact versions for runtime dependencies. The lockfile is committed.
- License must be on the allowlist in section 9.3.
- No native add-ons without maintainer approval.

### 5.8 Logging and output

- Library code never uses `console`. It receives a logger.
- CLI prints human output to stdout, diagnostics to stderr, and supports `--json` for machine output.
- Logs never contain secrets, cookies, tokens, storage state or personal data. Pass values through the redaction utility before logging.

## 6. Comments

Code explains **what**. Comments explain **why**, only where the reader cannot infer it.

### 6.1 Write a comment when

- A decision is non-obvious or deliberately unusual, and the alternative looks tempting.
- Code works around an external bug or platform quirk. Link the issue.
- A security or safety constraint is enforced here (redaction, allowlist, untrusted page content).
- A regular expression, algorithm or numeric threshold is not self-explanatory.
- An exported API has a contract callers must know: invariants, units, side effects, thrown error codes. Use a short TSDoc block.

### 6.2 Do not write a comment when

- It repeats the code: `// increment counter`, `// return the result`, `// constructor`.
- It narrates history: `// added for issue 42`, `// fixed bug`, `// changed by agent`. History belongs in git.
- It is commented-out code. Delete it.
- It is a conversation with a reviewer or model: `// as requested`, `// now handles X correctly`.
- A better name or a small function would remove the need for it.

### 6.3 Format

- Full sentences, English, sentence case.
- `TODO` and `FIXME` must reference an issue: `// TODO(#123): remove after Playwright 2 migration.`
- TSDoc on exported symbols is one to three lines; no `@param` that only restates the type.

```ts
// Bad: restates the code.
// Check if the locator is unique.
if (count === 1) { ... }

// Good: explains a constraint the code cannot show.
// Virtualized grids render only visible rows, so uniqueness is checked after scrolling
// the row into view; counting earlier reports false duplicates.
await row.scrollIntoViewIfNeeded();
```

## 7. Naming

### 7.1 Casing

| Element                                   | Convention                                                | Example                                |
| ----------------------------------------- | --------------------------------------------------------- | -------------------------------------- |
| Files and directories                     | kebab-case                                                | `locator-synthesis.ts`                 |
| Variables, functions, methods, properties | camelCase                                                 | `stabilityScore`, `synthesizeLocators` |
| Types, interfaces, classes                | PascalCase                                                | `SelectorRegistry`, `Runner`           |
| Zod schemas                               | PascalCase with `Schema` suffix; inferred type without it | `TestCaseSchema`, `TestCase`           |
| Module-level true constants               | UPPER_SNAKE_CASE                                          | `DEFAULT_TIMEOUT_MS`                   |
| Type parameters                           | Descriptive PascalCase, `T` only when trivial             | `TArtifact`                            |
| CLI commands and flags                    | kebab-case                                                | `qa explore --safe-mode`               |
| MCP tool names                            | snake_case with a domain prefix                           | `browser_click`, `registry_verify`     |
| JSON artifact fields                      | camelCase                                                 | `lastVerifiedAt`                       |
| Environment variables                     | UPPER_SNAKE_CASE with `QA_` prefix                        | `QA_BASE_URL`                          |

Acronyms are words: `apiUrl`, `HttpClient`, `parseHtml`, not `APIURL` or `parseHTML`.

### 7.2 Meaning

- Names state intent and domain meaning, not type: `pendingApprovals`, not `arr` or `list1`.
- Booleans read as questions: `isStable`, `hasTestId`, `canSubmit`, `shouldRetry`.
- Functions start with a verb: `resolveIdentity`, `renderReport`, `verifyLocator`. Predicates return booleans and start with `is`, `has`, `can`.
- Collections are plural; maps name key and value: `locatorsByElementId`.
- Include units in numeric names: `timeoutMs`, `sizeBytes`, `retryCount`.
- Avoid vague words: `data`, `info`, `item`, `obj`, `temp`, `manager`, `helper`, `util`, `handler` without a qualifier.
- Allowed abbreviations: `id`, `url`, `api`, `html`, `json`, `dom`, `cdp`, `mcp`, `cli`, `ms`. Spell out everything else.
- Use the domain glossary consistently: _artifact_, _gate_, _approval_, _evidence_, _registry_, _locator_, _element_, _identity_, _run_, _spoke_, _hub_, _defect draft_. Do not introduce synonyms.

## 8. Branches, commits and pull requests

### 8.1 Branches

- `main` is protected and always releasable. No direct commits, no force pushes.
- Short-lived branches from the latest `main`, one concern each, merged within days.
- Branch names: `<type>/<issue-number>-<short-kebab-description>`, for example `feat/42-pick-mode-overlay`. Omit the number when there is no issue.
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `chore`.
- Update a branch by rebasing on `main`. Do not merge `main` into feature branches.

### 8.2 Commits

- [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary` in imperative mood, lowercase summary, no trailing period, at most 72 characters.
  Scopes: `schemas`, `core`, `explorer`, `cli`, `mcp`, `agents`, `adapters`, `demo`, `repo`.
- Breaking changes use `!` after the scope and a `BREAKING CHANGE:` footer.
- Every commit is signed off under the Developer Certificate of Origin: `git commit -s`.
- Commits made with an agent keep the agent's `Co-Authored-By` trailer.
- Do not commit generated build output, `.qa/` runtime data, local planning notes or secrets.

### 8.3 Pull requests

- Fill in the pull request template completely.
- CI green on Windows, macOS and Linux before review.
- Squash merge; the squashed title follows Conventional Commits.
- A pull request that changes user-visible behavior includes a changeset and documentation updates.

### 8.4 Releases

- Versioning and publishing are automated end to end with `changesets/action` (task P0-16). A contributor's only manual step is adding a changeset (section 4, step 6). Every push to `main` with pending changesets opens or updates a bot-maintained "Version Packages" pull request; merging that pull request bumps versions, updates changelogs and publishes the changed packages to npm with provenance. Never run `npm version`, `npm publish` or edit a `package.json` version field by hand.
- One shared version for engine packages and adapters.
- Tags `vX.Y.Z` are created from `main` by the release workflow, never by hand.
- Artifact schemas carry their own version; incompatible schema changes ship with a migration.

## 9. Apache License 2.0 compliance

The project is licensed under Apache-2.0 (`LICENSE`). Every contributor, human or agent, keeps the project compliant.

### 9.1 Files in the repository

- `LICENSE`: full, unmodified Apache-2.0 text. Never edit it.
- `NOTICE`: project attribution. Keep it short. Add an entry only when bundled third-party material requires attribution in NOTICE under its own license.
- Source file header, required at the top of every `.ts`, `.js`, `.mjs` and `.cjs` source file, including tests and scripts:

  ```ts
  // Copyright The QA-AI-STLC Authors
  // SPDX-License-Identifier: Apache-2.0
  ```

  Markdown, JSON, YAML and generated files do not carry headers. `npm run lint` checks headers.

### 9.2 Contributions

- Contributions are accepted under Apache-2.0, section 5 (inbound license equals outbound license), certified by the DCO sign-off.
- Contributors keep their copyright; "The QA-AI-STLC Authors" means everyone listed in the git history.
- Do not submit code you do not have the right to license: employer-owned code, code under a non-disclosure agreement, or code copied from projects with incompatible licenses.
- Output from AI tools is acceptable only when the contributor reviews it and the output does not reproduce third-party code under an incompatible license.

### 9.3 Third-party code and dependencies

- Allowed licenses: Apache-2.0, MIT, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, CC0-1.0, Unlicense, BlueOak-1.0.0, Python-2.0.
- Require maintainer approval: MPL-2.0, EPL-2.0, CC-BY-4.0 (content only).
- Forbidden: GPL, LGPL, AGPL, SSPL, BUSL, Commons Clause, "no license", and any custom or non-commercial license.
- `npm run licenses:check` enforces the allowlist in CI for all runtime dependencies.
- Copied third-party source (a vendored file or a function longer than a few lines) is avoided. When unavoidable: keep its original copyright and license header, add a comment with the source URL and commit, list it in `NOTICE` if its license requires it, and mark local modifications as required by Apache-2.0 section 4(b).
- Published packages include `LICENSE` and `NOTICE`.

### 9.4 Trademarks and claims

- Apache-2.0 grants no trademark rights (section 6). Do not use third-party logos or names in a way that implies endorsement. Refer to Claude Code, Codex, Playwright and others factually.
- Do not add warranty, support or certification claims to documentation. The software is provided "AS IS" (section 7).

## 10. Community health files

GitHub's community profile checklist must stay complete. When a change affects one of these areas, update the file in the same pull request.

| Item                         | File or setting                                        | Must contain                                                                                                                           | Update when                                                                                                |
| ---------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Description                  | Repository settings: description and topics            | One sentence: open-source, model-agnostic QA framework running inside Claude Code and Codex                                            | Positioning or supported hosts change                                                                      |
| README                       | `README.md`                                            | Purpose, status, supported hosts, install, quick start, responsibility boundary, license, links to contributing and security           | Install steps, commands, hosts, scope or boundaries change                                                 |
| Code of conduct              | `CODE_OF_CONDUCT.md`                                   | Contributor Covenant 2.1 and a working enforcement contact                                                                             | The contact changes                                                                                        |
| Contributing                 | `CONTRIBUTING.md`                                      | Setup, local gate, branch and commit rules, DCO, license terms, scope boundaries                                                       | Tooling, commands or rules in this file change                                                             |
| License                      | `LICENSE`, `NOTICE`                                    | Unmodified Apache-2.0; project attribution                                                                                             | Third-party attribution is required                                                                        |
| Security policy              | `SECURITY.md`                                          | Supported versions, private reporting channel, response expectations, scope                                                            | A release line starts or ends support, or the channel changes                                              |
| Issue templates              | `.github/ISSUE_TEMPLATE/*`                             | Bug report and feature request forms with redaction warnings and scope checks                                                          | Supported hosts, required diagnostics or scope change                                                      |
| Pull request template        | `.github/PULL_REQUEST_TEMPLATE.md`                     | Summary, linked issue, verification, checklist mirroring section 4                                                                     | The local gate or review rules change                                                                      |
| Roadmap                      | `docs/public/ROADMAP.md`                               | Generated progress table; phases with planned capabilities; "Not planned" boundaries; no estimates                                     | Phase scope or delivered capabilities change; the progress table is updated by the `Roadmap sync` workflow |
| Project board and milestones | GitHub project, milestones per phase, `roadmap` issues | Status field with `Todo`, `Ready`, `In progress`, `In review`, `Blocked`, `Done`; automation in `.github/workflows/project-status.yml` | Tasks are added, split or dropped                                                                          |

`CONTRIBUTING.md` summarizes this file for human contributors. When a rule changes here, update `CONTRIBUTING.md` in the same change.

## 11. Distribution hygiene

- Every publishable package declares an explicit `files` allowlist. The allowlist includes built output, `README.md`, `LICENSE` and `NOTICE`, and nothing else.
- Never shipped: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `.github/`, `docs/`, tests, fixtures, source maps with absolute paths, `.qa/` data, examples.
- Before a release, `npm run pack:check` runs `npm pack --dry-run` for each package and fails on any file outside the allowlist.
- Plugins and extensions are generated and follow the same rule.

## 12. Best practices for this kind of framework

### 12.1 Enforce in code, not in prose

- If a rule can be checked, the engine checks it. Skills never contain "you must" rules for things the engine can enforce: phase order, approvals, preflight, evidence registration.
- Gates are state-machine transitions with hash-bound approvals. A prose instruction is a hint, never a control.

### 12.2 Skills and agent definitions

- A skill description states when to use it ("Use when ..."), with concrete trigger phrases. It does not describe what the skill is.
- `SKILL.md` stays under ~200 lines. Detailed material goes to `references/` and is loaded on demand.
- Skills call engine tools and interpret structured results. They do not duplicate engine logic, file formats or file paths.
- Every skill has triggering evals: it fires on intended requests and stays silent on unrelated ones.
- One canonical source in `agents/`; host adapters are generated.

### 12.3 MCP tools

- Each tool does one thing, has a Zod input schema and a structured output schema.
- Tool descriptions are written for a model: purpose, when to use, preconditions, what the result means.
- Tools are idempotent where possible and safe to retry.
- Results are compact. Never return raw HTML, full network bodies, screenshots as base64 or unbounded lists. Return references to registered artifacts and summaries with limits.
- Errors carry a stable `code` and a `remediation` the agent can act on.

### 12.4 Untrusted input

- Everything derived from the application under test (DOM text, accessibility tree, network data, console output) is untrusted and may contain prompt injection. Normalize it, cap its length, and pass it inside an explicit data boundary.
- Navigation and requests are restricted to the configured domain allowlist.
- Safe mode is the default: no form submission, no non-GET requests, no destructive actions.
- The security audit is on demand, never part of the pipeline, and runs only after an explicit authorization step recorded as a gate. Its checks are non-destructive: no brute force, no denial of service, no mutation outside owned test records, nothing outside the allowlist. Code-assisted checks read `source.path` and never write to it.

### 12.5 Evidence and artifacts

- Evidence is created by the engine, hashed, timestamped and linked to a step. An agent cannot reference a file the engine did not register.
- Evidence is scanned for secrets before registration; leaking files are deleted and a sanitized receipt is kept.
- Honest statuses: `blocked`, `skipped`, `uncertain` and `partial` are never reported as `passed` or `failed`.
- Artifact paths are project-relative.

### 12.6 Determinism and generation

- Generated code is verified by execution before it is registered: typecheck, run, feed the structured failure back.
- Generated tests reference locators through the generated locator module, never literal selectors.
- Output is deterministic: stable ordering, canonical JSON, no timestamps or random values in content that is hashed or snapshot-tested unless injected.

### 12.7 Self-review for safety- and integrity-sensitive changes

A change touching safe mode, a domain allowlist, a hash/tamper check, an approval gate or any other
integrity mechanism (12.4, 12.5, ADR-003, ADR-005) is not done when its own unit test passes. A
mechanism's test typically proves it runs, not that it is wired into every path that needs it — a
real batch of Phase 2 regressions shipped `done`, with green CI, from exactly this gap: safe mode
enforced on one navigation path but not another, a hash computed over bytes and re-checked over
text, an approval never cross-checked against its own ledger, a computed score never actually
consulted by anything, a field hardcoded to a safe-looking default (`false`, `0`) with no real
detection behind it. Before calling this class of change done, check it against all four:

1. Is the check enforced on every path that can trigger the thing it guards, not just the obvious one?
2. Does the value that gets hashed/checked/compared match, byte-for-byte and encoding-for-encoding,
   what gets read back later?
3. Is every computed signal actually consumed by a decision somewhere, or is it dead weight that
   looks load-bearing?
4. Is a safe-looking default (`false`, `0`, an empty array) backed by real logic, or is it a
   placeholder wearing a real field's name?

## 13. Testing

- Vitest. Unit tests sit next to the code as `*.test.ts`; integration and end-to-end tests live in `test/` of the package.
- Coverage is a required CI check (task P0-17), enforced per package with Vitest's `v8` provider. A pull request that drops a package's coverage below its recorded threshold fails CI; raise the threshold when coverage improves, never lower it to make a change pass. New code needs both unit tests for its logic and, where it crosses a module boundary (filesystem, browser, CLI, MCP), an integration test in `test/`.
- Coverage thresholds are tiered by what a package is responsible for (ADR-008), not one blanket number: **Tier 1** (`schemas`, `core`, `explorer`, `cli`, `test-utils` — validation, state and decision logic) stays at 100% statements/branches/functions/lines. **Tier 2** (`mcp-server`, every `runner-*` — protocol and third-party-tool plumbing, from the package's creation) starts at 90% statements/lines/functions and 80% branches. A new package defaults to Tier 1; it qualifies for Tier 2 only when its primary responsibility is protocol or third-party-tool plumbing, not merely because it is new. Both tiers keep the same ratchet-up-only rule.
- A branch that only differs in a default value (`x ?? fallback()`, an `options.foo === undefined` guard) still needs its own test on a Tier 1 package — a happy-path test that always supplies the value never exercises the fallback. Check the actual coverage report rather than assuming a passing test suite means every branch ran; `packages/cli`'s per-subcommand "defaults the project root to the current working directory" tests are the existing pattern to copy for a new CLI subcommand.
- Test behavior through public functions, not private internals.
- Unit tests make no network calls and do not launch browsers. Browser tests run against `examples/demo-app` only.
- Use temporary directories for filesystem tests and clean them up. Never touch the developer's home directory or real host configuration.
- Every bug fix includes a regression test that fails without the fix.
- Golden files for rendered reports and generated code; update them intentionally with `npm run test -- -u` and review the diff.
- Tests pass on Windows, macOS and Linux.

## 14. Security

- Report vulnerabilities privately as described in `SECURITY.md`. Never open a public issue for one.
- Credentials only through environment variables or a secret manager; examples use obvious placeholders such as `QA_ADMIN_PASSWORD`.
- `gitleaks` runs in pre-commit and CI. Do not bypass hooks.
- Test data, fixtures and screenshots contain no real personal data, real hostnames or real customer names.
