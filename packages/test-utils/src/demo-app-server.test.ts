// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from './temp-dir.js';
import { buildProject, startDemoApp } from './demo-app-server.js';

// A port no other test uses (they sit in 4391..4421).
const PORT = 4690;

// The real demo app, because the point of this helper is that the process it starts is the one it
// stops: if the server outlived `stop()`, the second start on the same port would refuse.
describe('startDemoApp', () => {
  it('serves the demo app and releases the port when stopped', async () => {
    const first = await startDemoApp(PORT);
    expect((await fetch(`http://localhost:${String(PORT)}/login`)).ok).toBe(true);
    await first.stop();

    const second = await startDemoApp(PORT);
    expect((await fetch(`http://localhost:${String(PORT)}/login`)).ok).toBe(true);
    await second.stop();
  }, 120_000);
});

describe('buildProject', () => {
  it('fails when the project does not compile, instead of letting a stale build run', async () => {
    await withTempDir(async (directory) => {
      await mkdir(join(directory, 'src'));
      await writeFile(join(directory, 'src', 'broken.ts'), 'export const value: number = "not a number";');
      await writeFile(
        join(directory, 'tsconfig.build.json'),
        JSON.stringify({
          compilerOptions: { strict: true, rootDir: 'src', outDir: 'dist' },
          include: ['src'],
        }),
      );

      await expect(buildProject(directory)).rejects.toThrow(/failed with exit code 1/);
    });
  }, 60_000);

  it('succeeds for a project that compiles', async () => {
    await withTempDir(async (directory) => {
      await mkdir(join(directory, 'src'));
      await writeFile(join(directory, 'src', 'fine.ts'), 'export const value = 1;');
      await writeFile(
        join(directory, 'tsconfig.build.json'),
        JSON.stringify({
          compilerOptions: { strict: true, rootDir: 'src', outDir: 'dist' },
          include: ['src'],
        }),
      );

      await expect(buildProject(directory)).resolves.toBeUndefined();
    });
  }, 60_000);
});
