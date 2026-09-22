// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { QaError } from '@qa-ai-stlc/core';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { createCommandContext } from '../command-context.js';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { runInit } from './init.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

const FULL_SCOPE = {
  e2e: 'out-of-scope',
  api: 'out-of-scope',
  a11y: 'out-of-scope',
  security: 'out-of-scope',
} as const;

function fakeContext(initialFiles: Readonly<Record<string, string>> = {}) {
  return createCommandContext({
    projectRoot: PROJECT_ROOT,
    io: { stdout: () => undefined, stderr: () => undefined },
    fs: createFakeFileSystem(initialFiles),
  });
}

describe('runInit', () => {
  it('creates config.yaml and .gitignore on an empty folder when every type is answered', async () => {
    const context = fakeContext();
    const result = await runInit(context, { testing: FULL_SCOPE });

    expect(result.alreadyInitialized).toBe(false);
    expect(result.created).toStrictEqual(['config.yaml', '.gitignore']);
    expect(await context.fs.pathExists(join(QA_DIR, 'config.yaml'))).toBe(true);
    expect(await context.fs.pathExists(join(QA_DIR, '.gitignore'))).toBe(true);
  });

  it('writes the answered testing scope into config.yaml', async () => {
    const context = fakeContext();
    const testing = {
      e2e: 'in-scope',
      api: 'out-of-scope',
      a11y: 'in-scope',
      security: 'out-of-scope',
    } as const;

    await runInit(context, { testing });

    const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as { testing: unknown };
    expect(written.testing).toStrictEqual(testing);
  });

  it('creates every committed subdirectory from the documented layout', async () => {
    const context = fakeContext();
    await runInit(context, { testing: FULL_SCOPE });

    for (const name of ['artifacts', 'selectors', 'runs', 'evidence', 'reports']) {
      expect(await context.fs.pathExists(join(QA_DIR, name))).toBe(true);
    }
  });

  it('throws when a testing type is left undecided and --defer-scope was not given', async () => {
    const context = fakeContext();

    await expect(runInit(context, { testing: { e2e: 'in-scope' } })).rejects.toThrow(QaError);
  });

  it('names every undecided type in the error message', async () => {
    const context = fakeContext();

    await expect(runInit(context, { testing: { e2e: 'in-scope' } })).rejects.toThrow(/api, a11y, security/);
  });

  it('allows an undecided type when deferScope is set, writing "undecided" for it', async () => {
    const context = fakeContext();

    const result = await runInit(context, { testing: { e2e: 'in-scope' }, deferScope: true });

    expect(result.created).toContain('config.yaml');
    const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as {
      testing: { api: string };
    };
    expect(written.testing.api).toBe('undecided');
  });

  it('throws when api is in-scope but no apiSource is given', async () => {
    const context = fakeContext();

    await expect(runInit(context, { testing: { ...FULL_SCOPE, api: 'in-scope' } })).rejects.toThrow(QaError);
  });

  it('writes an api block when api is in-scope and apiSource is given', async () => {
    const context = fakeContext();

    await runInit(context, { testing: { ...FULL_SCOPE, api: 'in-scope' }, apiSource: 'discover' });

    const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as {
      api: { source: string };
    };
    expect(written.api.source).toBe('discover');
  });

  it('writes a source block when sourcePath is given', async () => {
    const context = fakeContext();

    await runInit(context, { testing: FULL_SCOPE, sourcePath: 'app-src' });

    const written = parseYaml(await context.fs.readFile(join(QA_DIR, 'config.yaml'))) as {
      source: { path: string };
    };
    expect(written.source.path).toBe('app-src');
  });

  it('does not overwrite an existing config.yaml on a second run, and does not require scope answers', async () => {
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: 'custom: true' });
    const result = await runInit(context);

    expect(result.alreadyInitialized).toBe(true);
    expect(result.created).toStrictEqual(['.gitignore']);
    expect(await context.fs.readFile(join(QA_DIR, 'config.yaml'))).toBe('custom: true');
  });

  it('still creates the .qa/ layout when config.yaml already exists', async () => {
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: 'custom: true' });
    await runInit(context);

    expect(await context.fs.pathExists(join(QA_DIR, 'selectors'))).toBe(true);
  });

  it('overwrites an existing config.yaml when force is set and scope is answered', async () => {
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: 'custom: true' });
    const result = await runInit(context, { force: true, testing: FULL_SCOPE });

    expect(result.alreadyInitialized).toBe(false);
    expect(result.created).toStrictEqual(['config.yaml', '.gitignore']);
    expect(await context.fs.readFile(join(QA_DIR, 'config.yaml'))).not.toBe('custom: true');
  });

  it('requires scope answers when force is set, just like a fresh init', async () => {
    const context = fakeContext({ [join(QA_DIR, 'config.yaml')]: 'custom: true' });

    await expect(runInit(context, { force: true })).rejects.toThrow(QaError);
  });
});
