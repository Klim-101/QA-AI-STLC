// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { readdir, readFile as readNodeFile, writeFile as writeNodeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { describe, expect, it } from 'vitest';
import { nodeFileSystem } from './file-system.js';

describe('nodeFileSystem.createExclusive', () => {
  it('creates a file that is not there and refuses one that is, keeping the first content', async () => {
    await withTempDir(async (directory) => {
      const path = join(directory, 'claim');

      const first = await nodeFileSystem.createExclusive(path, 'first');
      const second = await nodeFileSystem.createExclusive(path, 'second');

      expect([first, second]).toEqual([true, false]);
      expect(await readNodeFile(path, 'utf-8')).toBe('first');
    });
  });

  it('lets exactly one of many parallel claimants win', async () => {
    await withTempDir(async (directory) => {
      const path = join(directory, 'claim');

      const outcomes = await Promise.all(
        Array.from({ length: 20 }, (_unused, index) => nodeFileSystem.createExclusive(path, String(index))),
      );

      expect(outcomes.filter(Boolean)).toHaveLength(1);
    });
  });

  it('reports a failure that is not "already exists"', async () => {
    await withTempDir(async (directory) => {
      await expect(
        nodeFileSystem.createExclusive(join(directory, 'missing', 'claim'), 'x'),
      ).rejects.toThrow();
    });
  });
});

describe('nodeFileSystem.writeFile', () => {
  it('replaces a file whole and leaves no temporary file behind', async () => {
    await withTempDir(async (directory) => {
      const path = join(directory, 'artifact.json');
      await writeNodeFile(path, 'old');

      await nodeFileSystem.writeFile(path, 'new');
      await nodeFileSystem.writeFile(path, new Uint8Array([1, 2, 3]));

      expect([...(await readNodeFile(path))]).toEqual([1, 2, 3]);
      expect(await readdir(directory)).toEqual(['artifact.json']);
    });
  });
});

describe('nodeFileSystem.listFiles', () => {
  it('does not list a file that is still being saved', async () => {
    await withTempDir(async (directory) => {
      await writeNodeFile(join(directory, 'artifact.json'), '{}');
      await writeNodeFile(join(directory, 'artifact.json.0f0f.qa-tmp'), '{');

      expect(await nodeFileSystem.listFiles(directory)).toEqual([join(directory, 'artifact.json')]);
    });
  });
});
