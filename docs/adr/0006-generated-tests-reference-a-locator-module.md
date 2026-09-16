# ADR-006: Generated tests reference a locator module

Status: Accepted
Date: 2026-09-16

## Context

A generated test that embeds its selectors as literal strings (`page.getByTestId('submit-button-1')`) ties the test's survival to the exact string never changing anywhere it is used. When a `data-testid` value is renamed in the frontend, every generated test that inlined it must be regenerated or hand-edited, even if nothing about the test's intent changed.

The explorer already builds a selector registry with stable, tracked identifiers per element (`elementId`), independent of the current selector value. Generated tests need a way to benefit from that stability instead of bypassing it.

## Decision

Generated tests reference locators through a single generated module (`tests/qa/locators.ts`) keyed by stable `elementId`, never through literal selector strings inline in the test body. When a selector value changes, `qa explore` regenerates only the locator module; the tests that import from it are unaffected.

## Consequences

Selector drift is fixed by regenerating one file, not by touching every test that happens to use the affected element. This is the framework's first-order self-healing mechanism, and it costs nothing extra at generation time since the registry already tracks `elementId` stability. It also gives generated tests a natural place for a human to read what locator strategy is actually in use, without opening every spec file.

The cost is one more generated artifact to keep in sync with the registry, with its own version stamp (see the upgrade path in the development plan) so a stale locator module is detected rather than silently used.
