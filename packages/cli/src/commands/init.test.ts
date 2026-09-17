// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCommandContext } from '../command-context.js';
import { createFakeFileSystem } from '../test-support/fake-file-system.js';
import { runInit } from './init.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

function fakeContext(initialFiles: Readonly<Record<string, string>> = {}) {
  return createCommandContext({
    projectRoot: PROJECT_ROOT,
    io: { stdout: () => undefined, stderr: () => undefined },
    fs: createFakeFileSystem(initialFiles),
  });
}

describe('runInit', () => {
  it('creates config.yaml and .gitignore on an empty folder', async () => {
    const context = fakeContext();
    const result = await runInit(context);

    expect(result.alreadyInitialized).toBe(false);
    expect(result.created).toStrictEqual(['config.yaml', '.gitignore']);
    expect(await context.fs.pathExists(join(QA_DIR, 'config.yaml'))).toBe(true);
    expect(await context.fs.pathExists(join(QA_DIR, '.gitignore'))).toBe(true);
  });

  it('creates every committed subdirectory from the documented layout', async () => {
    const context = fakeContext();
    await runInit(context);

    for (const name of ['artifacts', 'selectors', 'runs', 'evidence', 'reports']) {
      expect(await context.fs.pathExists(join(QA_DIR, name))).toBe(true);
    }
  });

  it('does not overwrite an existing config.yaml on a second run', async () => {
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: 'custom: true' });
    const result = await runInit(context);

    expect(result.alreadyInitialized).toBe(true);
    expect(result.created).toStrictEqual(['.gitignore']);
    expect(await context.fs.readFile(join(QA_DIR, 'config.yaml'))).toBe('custom: true');
  });

  it('overwrites an existing config.yaml when force is set', async () => {
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: 'custom: true' });
    const result = await runInit(context, { force: true });

    expect(result.alreadyInitialized).toBe(false);
    expect(result.created).toStrictEqual(['config.yaml', '.gitignore']);
    expect(await context.fs.readFile(join(QA_DIR, 'config.yaml'))).not.toBe('custom: true');
  });
});
