# ADR-004: The engine owns the browser

Status: Accepted
Date: 2026-09-16

## Context

Browser automation was the single most common point of failure observed in the previous internal framework this project learns from: a Playwright package present without its browser binary, a sandboxed runtime unable to launch Chromium, a runner unable to write evidence into the project directory. Each failure mode traced back to browser ownership being ambiguous — sometimes the project's own Playwright install, sometimes a runtime the agent host provided, with no single place responsible for whether it actually worked.

A user's project may or may not already have Playwright installed, at a version the framework did not choose.

## Decision

`packages/core` (through `packages/runner-playwright`) depends on Playwright directly and owns the browser lifecycle. `qa doctor` checks Node version, browser binary presence, and base URL reachability in one place, and `qa doctor --fix` installs missing browsers. Reusing a project's existing Playwright installation is an explicit, compatibility-checked option, not the default assumption.

## Consequences

There is exactly one place to look when browser automation fails, and one preflight command (`qa doctor`) that catches the failure before a run starts rather than mid-run with a cryptic `spawn EPERM`. Evidence capture, tracing and screenshots all go through the same owned browser instance, so evidence integrity (ADR-005) has a single enforcement point instead of one per integration path.

The cost is a Playwright version the engine controls, which can diverge from a version the project team already standardized on. The explicit reuse option exists for that case, but it is opt-in and validated, so a mismatch is reported rather than silently tolerated.
