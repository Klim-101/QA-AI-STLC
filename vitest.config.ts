// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Without this, the root config also matches test files directly (its own implicit
    // project), so every workspace package's tests would run twice: once under the root
    // project and once under the "packages/*" project this config defines for it.
    include: [],
    projects: ['packages/*'],
    // A package's tsc build output under dist/ still matches the default *.test.js glob;
    // exclude it so a built test never runs a second time alongside its src/*.test.ts source.
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'adapters/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
});
