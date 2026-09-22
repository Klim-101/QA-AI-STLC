// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { nodeFileSystem } from './ports/file-system.js';
import { QaStore } from './qa-store.js';
import { createFakeFileSystem } from './test-support/fake-file-system.js';

const PointSchema = z.object({ x: z.number() });

describe('QaStore', () => {
  it('resolves a relative path under .qa/ and back', () => {
    const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });

    const absolutePath = store.resolve('artifacts/scope.json');

    expect(absolutePath).toBe(join('project', '.qa', 'artifacts', 'scope.json'));
    expect(store.toRelativePath(absolutePath)).toBe('artifacts/scope.json');
  });

  it('reports whether .qa/ exists', async () => {
    const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
    expect(await store.exists()).toBe(false);

    await store.ensureLayout();

    expect(await store.exists()).toBe(true);
  });

  it('creates the documented directory layout', async () => {
    await withTempDir(async (projectRoot) => {
      const store = new QaStore({ projectRoot, fs: nodeFileSystem });

      await store.ensureLayout();

      for (const name of ['artifacts', 'selectors', 'runs', 'evidence', 'reports']) {
        expect(await nodeFileSystem.pathExists(join(projectRoot, '.qa', name))).toBe(true);
      }
    });
  });

  it('writes and reads JSON, creating parent directories as needed', async () => {
    const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });

    await store.writeJson('artifacts/point.json', { x: 1 });

    expect(await store.pathExists('artifacts/point.json')).toBe(true);
    expect(await store.readJson('artifacts/point.json', PointSchema)).toEqual({ x: 1 });
  });

  it('reads and writes text content', async () => {
    const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });

    await store.writeText('config.yaml', 'testing: {}\n');

    expect(await store.readText('config.yaml')).toBe('testing: {}\n');
  });

  it('writes raw bytes, creating parent directories as needed', async () => {
    const fs = createFakeFileSystem();
    const store = new QaStore({ projectRoot: join('project'), fs });
    const bytes = new Uint8Array([1, 2, 3]);

    await store.writeBytes('evidence/run-1/step.png', bytes);

    expect(fs.getRawFile(store.resolve('evidence/run-1/step.png'))).toEqual(bytes);
  });

  it("reads back raw bytes unchanged, without readText's lossy UTF-8 decode", async () => {
    const store = new QaStore({ projectRoot: join('project'), fs: createFakeFileSystem() });
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);

    await store.writeBytes('evidence/run-1/step.png', bytes);

    expect(await store.readBytes('evidence/run-1/step.png')).toEqual(bytes);
  });

  it('defaults to the real Node filesystem when none is provided', () => {
    const store = new QaStore({ projectRoot: join('project') });
    expect(store.qaDir).toBe(join('project', '.qa'));
  });
});
