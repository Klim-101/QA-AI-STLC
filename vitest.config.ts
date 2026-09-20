// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Without this, the root config also matches test files directly (its own implicit
    // project), so every workspace package's tests would run twice: once under the root
    // project and once under the "packages/*" project this config defines for it.
    include: [],
    projects: ['packages/*', 'examples/*'],
    // A package's tsc build output under dist/ still matches the default *.test.js glob;
    // exclude it so a built test never runs a second time alongside its src/*.test.ts source.
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'adapters/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      // Without `include`, v8 only reports files a test actually imported, so a source file with
      // zero tests is silently absent from the summary instead of failing a threshold at 0%.
      include: ['packages/*/src/**/*.ts'],
      // `bin/` entry points call `process.exit` (AGENTS.md 5.4) and cannot be exercised in-process
      // without killing the test runner; `runCli`, the logic they call, is fully covered instead.
      exclude: ['packages/*/src/**/*.test.ts', 'packages/*/src/bin/**'],
      // AGENTS.md 13 / ADR-008: enforced per package, in two tiers; a threshold is only ever
      // raised as coverage improves, never lowered to make an unrelated change pass.
      thresholds: {
        // Tier 1 — validation, state and decision logic: a missed branch here is a silent
        // correctness bug (a gate that does not block, a selector that resolves wrong).
        'packages/schemas/src/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'packages/test-utils/src/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'packages/core/src/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'packages/cli/src/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'packages/explorer/src/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        // Tier 2 — protocol and third-party-tool plumbing: most of the branch count is defensive
        // handling of a third-party failure mode, not this project's own logic, and a bug here
        // tends to fail loudly rather than silently. Starting bar, not a ceiling — still ratchets
        // up as coverage improves, same as Tier 1 (ADR-008). Inert until the first
        // packages/runner-* exists (Phase 3).
        'packages/mcp-server/src/**': { statements: 90, branches: 80, functions: 90, lines: 90 },
        'packages/runner-*/src/**': { statements: 90, branches: 80, functions: 90, lines: 90 },
      },
    },
  },
});
