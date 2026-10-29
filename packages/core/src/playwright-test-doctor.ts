// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { dirname, join } from 'node:path';
import type { TestingScope } from '@qa-ai-stlc/schemas';
import type { DoctorCheckResult } from './browser-doctor.js';
import type { FileSystem } from './ports/file-system.js';

export const PLAYWRIGHT_TEST_CHECK_NAME = 'playwright-test';

/**
 * Whether the project's testing scope produces specs that import `@playwright/test`: a generated
 * browser, API or accessibility spec is typechecked and run against the package installed in the
 * project, not the copy the engine itself carries.
 */
export function isPlaywrightSpecInScope(testing: TestingScope): boolean {
  return [testing.e2e, testing.api, testing.a11y].includes('in-scope');
}

/**
 * Checks that `@playwright/test` resolves from the project root the way Node would: in a
 * `node_modules` directory of the root or of any directory above it. The engine's own Chromium being
 * present says nothing about this, so a bare project passed `qa.doctor` and then could not verify a
 * single generated spec.
 */
export async function checkPlaywrightTestResolvable(
  fs: FileSystem,
  projectRoot: string,
): Promise<DoctorCheckResult> {
  let directory = projectRoot;
  for (;;) {
    if (await fs.pathExists(join(directory, 'node_modules', '@playwright', 'test', 'package.json'))) {
      return {
        name: PLAYWRIGHT_TEST_CHECK_NAME,
        status: 'pass',
        message: '@playwright/test resolves from the project root',
      };
    }
    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  return {
    name: PLAYWRIGHT_TEST_CHECK_NAME,
    status: 'fail',
    message: '@playwright/test is not installed for this project, so a generated spec cannot be verified',
    remediation:
      'In the project root run "npm init -y" if there is no package.json, then "npm install --save-dev --save-exact @qa-ai-stlc/cli". ' +
      'Run it in your own terminal if the agent host has no network access, and never point npm at a cache directory inside the project.',
  };
}
