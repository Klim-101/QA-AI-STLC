# Architecture Decision Records

An ADR records one significant, hard-to-reverse decision: the context that forced it, the decision itself, and its consequences. It is not written for every change; see `AGENTS.md` for when a decision needs one.

| ID                                                                           | Title                                                                | Status   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| [ADR-0001](0001-no-model-calls-in-the-engine.md)                             | No model calls in the engine                                         | Accepted |
| [ADR-0002](0002-json-is-canonical-markdown-is-rendered.md)                   | JSON is canonical, Markdown is rendered                              | Accepted |
| [ADR-0003](0003-hash-bound-approval-gates.md)                                | Hash-bound approval gates                                            | Accepted |
| [ADR-0004](0004-the-engine-owns-the-browser.md)                              | The engine owns the browser                                          | Accepted |
| [ADR-0005](0005-the-agent-has-no-browser-outside-engine-tools.md)            | The agent has no browser outside engine tools                        | Accepted |
| [ADR-0006](0006-generated-tests-reference-a-locator-module.md)               | Generated tests reference a locator module                           | Accepted |
| [ADR-0007](0007-engine-and-plugin-share-one-version.md)                      | Engine and plugin share one version                                  | Accepted |
| [ADR-0008](0008-tiered-coverage-thresholds-by-package-trust-level.md)        | Tiered coverage thresholds by package trust level                    | Accepted |
| [ADR-0009](0009-execution-sessions-may-relax-the-get-only-rule.md)           | Execution sessions may relax the GET-only rule                       | Accepted |
| [ADR-0010](0010-generation-contract.md)                                      | Generation contract                                                  | Accepted |
| [ADR-0011](0011-layered-project-configuration.md)                            | Layered project configuration                                        | Accepted |
| [ADR-0012](0012-api-authentication-profiles.md)                              | API authentication profiles                                          | Accepted |
| [ADR-0013](0013-browser-toolset-parity-and-compact-page-views.md)            | Browser toolset parity and compact page views                        | Accepted |
| [ADR-0014](0014-environment-allowlist-for-safe-non-get-requests.md)          | Environment allowlist for safe non-GET requests                      | Accepted |
| [ADR-0015](0015-navigation-probing-clicks-controls-in-isolated-contexts.md)  | Exploration may click navigation-only controls, in isolated contexts | Accepted |
| [ADR-0016](0016-structured-case-expectations-judged-by-the-engine.md)        | Cases declare structured expectations that the engine judges         | Accepted |
| [ADR-0017](0017-exploration-opens-collapsed-panels-in-discarded-contexts.md) | Exploration may open collapsed panels, in discarded contexts         | Accepted |
| [ADR-0018](0018-safe-mode-lets-the-safe-http-methods-through.md)             | Safe mode lets the safe HTTP methods through                         | Accepted |
| [ADR-0019](0019-allowlist-entries-may-name-a-port.md)                        | An allowlist entry may name a port                                   | Accepted |
| [ADR-0020](0020-registry-elements-name-their-environment.md)                 | Registry elements name their environment                             | Accepted |
| [ADR-0021](0021-what-each-session-may-send.md)                               | What each kind of session may send                                   | Accepted |

New ADRs are numbered sequentially and never renumbered or deleted. The number is written with four digits (`ADR-0001`), as in the file name; an older code comment may use three digits (`ADR-005`) and means the same record.

A decision that is later reversed or replaced gets a new ADR; the old one stays, marked `Superseded by ADR-0NNN`.

A change that keeps the decision (a statement that went stale, a clarification, a follow-up such as replacing a flag with a stricter input) edits the text in place and adds a line under `Date`: `Amended: YYYY-MM-DD (#issue): what changed`. Do not append an "Amendment" section that contradicts the text above it. The ADR then reads as the decision in force, and the line says that it was changed.

ADR-0021 summarizes what each kind of session may send. A change to a decision that alters one of its cells edits that table in the same change.

Use [`template.md`](template.md) for a new record.
