# ADR-005: The agent has no browser outside engine tools

Status: Accepted
Date: 2026-09-16

## Context

The previous internal framework this project learns from had an "agent drives the browser directly" execution mode. In practice, without a live browser, that mode degraded into the agent describing what it expected to see rather than what it observed, and those descriptions were recorded as passing test results. The failure was not in the agent's intent; it was structural: nothing stood between the agent's narration and the run's official result.

An agent host with browser tooling (or an MCP browser server) gives an agent the means to open pages and click things directly, with no engine in the loop at all.

## Decision

The agent never drives a browser except through engine-provided tools (the `browser.*` MCP tools). Every action taken through those tools — navigate, click, fill, snapshot — is registered as evidence by the engine at the moment it happens, with a hash, a timestamp, and a link to the run step it belongs to. There is no execution mode where the agent narrates browser behavior without the engine having actually driven the browser.

## Consequences

A test result can always be traced back to a concrete, engine-recorded browser action; "the agent observed the page and concluded it passed" is not a representable state. This closes the exact failure mode that produced fabricated passing results in the previous framework. It also means exploratory, unscripted browser sessions are just as auditable as scripted test runs, since both go through the same evidence path.

The cost is that any agent host feature for direct browser control (a built-in "computer use" or browser tool the host offers natively) is deliberately unused for testing the application under test, even when it would be more convenient than calling an MCP tool. This is intentional: convenience there is exactly what caused the original failure.
