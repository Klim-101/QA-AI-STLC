// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  fetchHttpClient,
  nodeFileSystem,
  nodeProcessRunner,
  noopLogger,
  playwrightBrowserLauncher,
  systemClock,
  type EngineContext,
} from '@qa-ai-stlc/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { playwrightRunner } from '../src/playwright-runner.js';

const require = createRequire(import.meta.url);

// Spawns the real Playwright Test runner, like the demo-app test, but needs no browser: the specs
// only assert on constants. What it proves is which Playwright copy runs a project's specs.
const SPEC_TIMEOUT_MS = 60_000;

function packageDirectory(request: string, paths?: readonly string[]): string {
  return dirname(
    require.resolve(`${request}/package.json`, paths === undefined ? {} : { paths: [...paths] }),
  );
}

describe('playwrightRunner (a project with its own @playwright/test)', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'qa-runner-project-copy-'));
    // A second, separate install of Playwright, as a project that depends on it has next to the
    // engine's own (the engine runs from an `npx` cache). Same version, different module instances.
    const testPackage = packageDirectory('@playwright/test');
    const modulesDirectory = join(projectRoot, 'node_modules');
    await mkdir(join(modulesDirectory, '@playwright'), { recursive: true });
    await cp(testPackage, join(modulesDirectory, '@playwright', 'test'), { recursive: true });
    // `playwright-core` is a dependency of `playwright`, not of `@playwright/test`, so npm may nest it
    // under `playwright`; resolving it from there finds it wherever npm placed it.
    const playwrightPackage = packageDirectory('playwright', [testPackage]);
    await cp(playwrightPackage, join(modulesDirectory, 'playwright'), { recursive: true });
    await cp(
      packageDirectory('playwright-core', [playwrightPackage]),
      join(modulesDirectory, 'playwright-core'),
      { recursive: true },
    );
    await mkdir(join(projectRoot, 'tests'), { recursive: true });
  }, SPEC_TIMEOUT_MS);

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  function engine(): EngineContext {
    return {
      projectRoot,
      fs: nodeFileSystem,
      clock: systemClock,
      logger: noopLogger,
      processRunner: nodeProcessRunner,
      httpClient: fetchHttpClient,
      browserLauncher: playwrightBrowserLauncher,
      env: process.env,
    };
  }

  it(
    'runs the specs with the project’s own copy, so they register their tests',
    async () => {
      const specFile = join(projectRoot, 'tests', 'own-copy.spec.ts');
      await writeFile(
        specFile,
        [
          "import { expect, test } from '@playwright/test';",
          "test('constants are equal', { annotation: { type: 'testCaseId', description: 'project-copy-case' } }, () => {",
          '  expect(1 + 1).toBe(2);',
          '});',
          '',
        ].join('\n'),
      );

      const outcomes = await playwrightRunner.run(engine(), {
        runId: 'run-project-copy',
        baseUrl: 'http://localhost:1/',
        specFiles: [specFile],
      });

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.result.status).toBe('passed');
    },
    SPEC_TIMEOUT_MS,
  );

  it(
    'says why no test ran when a spec fails to load',
    async () => {
      const specFile = join(projectRoot, 'tests', 'broken.spec.ts');
      await writeFile(
        specFile,
        [
          "import { test } from '@playwright/test';",
          "import { missing } from './does-not-exist.js';",
          "test('never registered', () => { missing(); });",
          '',
        ].join('\n'),
      );

      await expect(
        playwrightRunner.run(engine(), {
          runId: 'run-broken-spec',
          baseUrl: 'http://localhost:1/',
          specFiles: [specFile],
        }),
      ).rejects.toMatchObject({
        code: 'RUNNER_NO_TESTS_RAN',
        message: expect.stringContaining('does-not-exist') as string,
      });
    },
    SPEC_TIMEOUT_MS,
  );
});
