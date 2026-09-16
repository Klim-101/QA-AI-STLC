# ADR-002: JSON is canonical, Markdown is rendered

Status: Accepted
Date: 2026-09-16

## Context

QA artifacts (scope, test cases, run results, defect drafts) need two things at once: a shape a program can validate and diff, and a shape a human can read in a pull request or a chat. The previous internal framework this project learns from kept both a Markdown file and a JSON file for the same artifact, each written independently by whichever step produced it. The two drifted: a JSON collection would carry `schemaVersion: "1.0"` while its Markdown twin described a different field set, and nothing caught the mismatch until a human noticed.

An agent asked to "write the test plan" will, by default, write prose, because that is what test plans usually look like. Left unconstrained, this produces exactly the two-file, hand-synchronized pattern that caused the drift.

## Decision

Every QA artifact has exactly one canonical representation: JSON validated against a Zod schema. Markdown and HTML views are rendered from that JSON by the engine (`qa report`, or the equivalent MCP tool). No skill or agent instruction asks for a hand-written Markdown report; an agent produces the structured data, and the engine turns it into prose.

## Consequences

A report can never disagree with the data it is supposed to summarize, because it is generated from that data on demand rather than maintained as a separate file. Validation, diffing, and traceability queries all operate on one typed structure instead of parsing prose. Schema evolution (`packages/schemas`) has one artifact to version, not two.

The cost is that every new report format needs a renderer in the engine before it can exist, which is slower than asking an agent to draft text. This is accepted deliberately: the alternative is the exact drift this decision exists to prevent. Golden-file tests on renderers (see `AGENTS.md` testing section) keep the generated Markdown itself reviewable in pull requests, so the readability benefit of Markdown is not lost, only its role as a second source of truth.
