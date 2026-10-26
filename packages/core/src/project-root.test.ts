// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join, resolve } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { QaError } from './errors.js';
import {
  findEnclosingQaDirectory,
  listAncestorDirectories,
  resolveEngineProjectRoot,
  resolveProjectRoot,
} from './project-root.js';

const ROOT = resolve('workspace');
const APP = join(ROOT, 'app');
const NESTED = join(APP, 'src', 'deep');

describe('listAncestorDirectories', () => {
  it('lists the start directory first and ends at the filesystem root', () => {
    const directories = listAncestorDirectories(NESTED);

    expect(directories[0]).toBe(NESTED);
    expect(directories[1]).toBe(join(APP, 'src'));
    expect(directories).toContain(ROOT);
    const last = directories[directories.length - 1] ?? '';
    expect(resolve(last, '..')).toBe(last);
  });
});

describe('resolveProjectRoot', () => {
  it('returns the nearest ancestor holding .qa', () => {
    const qaDirectories = new Set([join(APP, '.qa'), join(ROOT, '.qa')]);

    expect(resolveProjectRoot(NESTED, (path) => qaDirectories.has(path))).toBe(APP);
  });

  it('returns the start directory itself when no .qa exists above it', () => {
    expect(resolveProjectRoot(NESTED, () => false)).toBe(NESTED);
  });
});

describe('resolveEngineProjectRoot', () => {
  const PLUGIN = join(ROOT, 'plugin-cache');
  const PROJECT = join(ROOT, 'project');
  const directories = new Set([PROJECT, APP, PLUGIN, NESTED]);

  function resolveWith(
    env: Record<string, string | undefined>,
    cwd = NESTED,
    qaDirectories: readonly string[] = [],
  ): string {
    return resolveEngineProjectRoot({
      cwd,
      env,
      isDirectory: (path) => directories.has(path),
      hasQaDirectory: (path) => qaDirectories.includes(path),
    });
  }

  function failureOf(action: () => string): QaError {
    try {
      action();
    } catch (error) {
      if (error instanceof QaError) {
        return error;
      }
      throw error;
    }
    throw new Error('Expected the call to throw.');
  }

  it('uses QA_PROJECT_ROOT exactly as given, whatever the working directory holds', () => {
    expect(resolveWith({ QA_PROJECT_ROOT: PROJECT }, NESTED, [join(APP, '.qa')])).toBe(PROJECT);
  });

  it('uses QA_PROJECT_ROOT even when the working directory is inside the plugin directory', () => {
    expect(resolveWith({ QA_PROJECT_ROOT: PROJECT, PLUGIN_ROOT: PLUGIN }, join(PLUGIN, 'bin'))).toBe(PROJECT);
  });

  it('rejects a relative QA_PROJECT_ROOT', () => {
    expect(failureOf(() => resolveWith({ QA_PROJECT_ROOT: 'project' })).code).toBe('PROJECT_ROOT_INVALID');
  });

  it('rejects a QA_PROJECT_ROOT that is not an existing directory', () => {
    const error = failureOf(() => resolveWith({ QA_PROJECT_ROOT: join(ROOT, 'missing') }));

    expect(error.code).toBe('PROJECT_ROOT_INVALID');
    expect(error.remediation).toContain('QA_PROJECT_ROOT');
  });

  it('treats an empty QA_PROJECT_ROOT as unset', () => {
    expect(resolveWith({ QA_PROJECT_ROOT: '' }, NESTED, [join(APP, '.qa')])).toBe(APP);
  });

  it('refuses to act when the working directory is the plugin directory', () => {
    const error = failureOf(() => resolveWith({ PLUGIN_ROOT: PLUGIN }, PLUGIN));

    expect(error.code).toBe('PROJECT_ROOT_UNRESOLVED');
    expect(error.remediation).toContain('codex mcp add');
  });

  it('refuses to act when the working directory is below the plugin directory', () => {
    expect(failureOf(() => resolveWith({ PLUGIN_ROOT: PLUGIN }, join(PLUGIN, 'a', 'b'))).code).toBe(
      'PROJECT_ROOT_UNRESOLVED',
    );
  });

  it('does not mistake a sibling directory with the same prefix for the plugin directory', () => {
    const sibling = `${PLUGIN}-other`;

    expect(resolveWith({ PLUGIN_ROOT: PLUGIN }, sibling)).toBe(sibling);
  });

  it('ignores an empty PLUGIN_ROOT', () => {
    expect(resolveWith({ PLUGIN_ROOT: '' }, NESTED)).toBe(NESTED);
  });

  it('falls back to the nearest .qa ancestor of the working directory without either variable', () => {
    expect(resolveWith({}, NESTED, [join(APP, '.qa')])).toBe(APP);
  });
});

describe('findEnclosingQaDirectory', () => {
  it('finds .qa in the start directory', async () => {
    const fs = createFakeFileSystem();
    await fs.mkdir(join(APP, '.qa'));

    expect(await findEnclosingQaDirectory(fs, APP)).toBe(APP);
  });

  it('finds .qa in a parent directory', async () => {
    const fs = createFakeFileSystem();
    await fs.mkdir(join(ROOT, '.qa'));

    expect(await findEnclosingQaDirectory(fs, NESTED)).toBe(ROOT);
  });

  it('returns undefined when no ancestor holds .qa', async () => {
    expect(await findEnclosingQaDirectory(createFakeFileSystem(), NESTED)).toBeUndefined();
  });
});
