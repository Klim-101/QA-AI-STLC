# ADR-001: No model calls in the engine

Status: Accepted
Date: 2026-09-16

## Context

The framework's value depends on running entirely inside an agent host (Claude Code, Codex) that the user already pays for. If the engine itself called a language model, the project would need its own API keys, its own billing relationship with a model provider, and a story for what happens when a user has no such keys. It would also blur who is responsible for model output: the host's model, or a second model called by a library the host is using.

Every dependency added to the engine is a candidate for calling a model, whether directly through a provider SDK or indirectly through a library that wraps one. Without an explicit rule, this creep is invisible until a release ships with a hidden model dependency.

## Decision

No package in this repository depends on a language model SDK or calls a model API. Concretely: no `@anthropic-ai/*`, `openai`, `ai`, `@google/genai`, `langchain`, or equivalent package appears in any `package.json`, enforced by a CI denylist check. All reasoning — planning, test design, judgment calls — happens in the agent host the user is already running. Deterministic work (crawling, hashing, running tests, rendering reports) is TypeScript code with no model in the loop.

## Consequences

The engine is usable, testable and auditable without any model access at all: `qa doctor`, `qa explore --verify`, `qa run` and `qa report` work in CI with zero API keys. The project has no hosting cost and no model-provider dependency to track for outages, pricing changes or deprecations. Model-agnosticism becomes structural rather than a compatibility promise: the same engine works with any host's model because it never sees one.

The cost is that any capability which needs judgment (interpreting a page's semantics, writing a test case) must be expressed as a tool the agent calls, not as a function the engine can do the reasoning parts of on its own. A tempting shortcut — "just call the API directly to reformat this text" — is not available and is not a case-by-case exception.

Considered and rejected: a headless mode with the framework's own model calls, gated behind a user-supplied API key. This was cut from the plan entirely (not merely deferred) because it reintroduces exactly the billing and provider-dependency questions this decision exists to avoid, for a CI use case that generated tests already serve without any model.
