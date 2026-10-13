// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePlaywrightCliPath } from './playwright-cli.js';

const BUNDLED_CLI_PATH = join('bundled', 'cli.js');

describe('resolvePlaywrightCliPath', () => {
  let projectRoot: string | undefined;

  afterEach(async () => {
    if (projectRoot !== undefined) {
      await rm(projectRoot, { recursive: true, force: true });
      projectRoot = undefined;
    }
  });

  async function createProject(options: { readonly hasPlaywright: boolean }): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'qa-playwright-cli-'));
    projectRoot = root;
    await mkdir(join(root, 'tests', 'qa'), { recursive: true });
    if (options.hasPlaywright) {
      const packageDir = join(root, 'node_modules', '@playwright', 'test');
      await mkdir(packageDir, { recursive: true });
      await writeFile(
        join(packageDir, 'package.json'),
        JSON.stringify({ name: '@playwright/test', version: '0.0.0', exports: { './cli': './cli.js' } }),
      );
      await writeFile(join(packageDir, 'cli.js'), '');
    }
    return root;
  }

  it('uses the @playwright/test the spec itself resolves, not the bundled copy', async () => {
    const root = await createProject({ hasPlaywright: true });

    const cliPath = resolvePlaywrightCliPath(join(root, 'tests', 'qa'), BUNDLED_CLI_PATH);

    expect(cliPath).toBe(join(root, 'node_modules', '@playwright', 'test', 'cli.js'));
  });

  it('falls back to the bundled copy when the spec has no @playwright/test near it', async () => {
    const root = await createProject({ hasPlaywright: false });

    const cliPath = resolvePlaywrightCliPath(join(root, 'tests', 'qa'), BUNDLED_CLI_PATH);

    expect(cliPath).toBe(BUNDLED_CLI_PATH);
  });
});
