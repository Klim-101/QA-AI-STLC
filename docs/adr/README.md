# Architecture Decision Records

An ADR records one significant, hard-to-reverse decision: the context that forced it, the decision itself, and its consequences. It is not written for every change; see `AGENTS.md` for when a decision needs one.

| ID                                                                   | Title                                             | Status   |
| -------------------------------------------------------------------- | ------------------------------------------------- | -------- |
| [ADR-001](0001-no-model-calls-in-the-engine.md)                      | No model calls in the engine                      | Accepted |
| [ADR-002](0002-json-is-canonical-markdown-is-rendered.md)            | JSON is canonical, Markdown is rendered           | Accepted |
| [ADR-003](0003-hash-bound-approval-gates.md)                         | Hash-bound approval gates                         | Accepted |
| [ADR-004](0004-the-engine-owns-the-browser.md)                       | The engine owns the browser                       | Accepted |
| [ADR-005](0005-the-agent-has-no-browser-outside-engine-tools.md)     | The agent has no browser outside engine tools     | Accepted |
| [ADR-006](0006-generated-tests-reference-a-locator-module.md)        | Generated tests reference a locator module        | Accepted |
| [ADR-007](0007-engine-and-plugin-share-one-version.md)               | Engine and plugin share one version               | Accepted |
| [ADR-008](0008-tiered-coverage-thresholds-by-package-trust-level.md) | Tiered coverage thresholds by package trust level | Accepted |

New ADRs are numbered sequentially and never renumbered or deleted. A decision that is later reversed gets a new ADR that supersedes the old one; the old one stays, marked `Superseded by ADR-0NN`.

Use [`template.md`](template.md) for a new record.
