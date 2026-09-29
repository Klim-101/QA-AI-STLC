// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join, resolve } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { findEnclosingQaDirectory, listAncestorDirectories, resolveProjectRoot } from './project-root.js';

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
