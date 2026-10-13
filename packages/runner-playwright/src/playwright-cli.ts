// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { createRequire } from 'node:module';
import { join } from 'node:path';

/**
 * The Playwright CLI the specs will load their `@playwright/test` from: resolved from the
 * specs' common directory, the way a spec's `import` resolves. A spec that imports one copy of
 * `@playwright/test` while a different copy runs it registers its tests with a module nobody is
 * listening to, and Playwright reports "did not expect test() to be called here" with zero tests.
 * That is the normal situation when the engine runs from an `npx` cache and the project has its
 * own Playwright, so the engine's bundled copy is only the fallback for a spec with none near it.
 */
export function resolvePlaywrightCliPath(specDirectory: string, bundledCliPath: string): string {
  try {
    return createRequire(join(specDirectory, 'resolve-from-here.js')).resolve('@playwright/test/cli');
  } catch {
    // No `@playwright/test` is reachable from the spec; the bundled copy is the only one left.
    return bundledCliPath;
  }
}
