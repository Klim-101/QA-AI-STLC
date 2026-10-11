// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceFixture } from './test-support/source-fixture.js';

describe('SourceCheckout.scan', () => {
  it('reads the text files under the root in a stable order, with project-relative paths', async () => {
    const source = sourceFixture({
      'app/b.ts': 'b',
      'app/a.ts': 'a',
      'app/nested/c.ts': 'c',
      'other/outside.ts': 'outside',
    });

    const scan = await source.scan();

    expect(scan.files).toEqual([
      { path: 'app/a.ts', text: 'a' },
      { path: 'app/b.ts', text: 'b' },
      { path: 'app/nested/c.ts', text: 'c' },
    ]);
    expect(scan.isTruncated).toBe(false);
    expect(scan.skippedCount).toBe(0);
  });

  it('leaves out installed and generated directories at any depth', async () => {
    const source = sourceFixture({
      'app/src/kept.ts': 'kept',
      'app/node_modules/pkg/index.js': 'installed',
      'app/packages/x/node_modules/y.js': 'installed',
      'app/dist/out.js': 'generated',
      'app/.git/config': 'git',
    });

    const paths = (await source.scan()).files.map((file) => file.path);

    expect(paths).toEqual(['app/src/kept.ts']);
  });

  it('counts, and does not read, binary, oversized and image files', async () => {
    const source = sourceFixture(
      {
        'app/text.ts': 'ok',
        'app/blob.dat': new Uint8Array([1, 2, 0, 3]),
        'app/big.txt': 'x'.repeat(20),
        'app/logo.png': 'not really a png',
      },
      { maxFileSizeBytes: 10 },
    );

    const scan = await source.scan();

    expect(scan.files.map((file) => file.path)).toEqual(['app/text.ts']);
    expect(scan.skippedCount).toBe(3);
  });

  it('says so when the file limit stopped the scan', async () => {
    const source = sourceFixture({ 'app/a.ts': 'a', 'app/b.ts': 'b', 'app/c.ts': 'c' }, { maxFiles: 2 });

    const scan = await source.scan();

    expect(scan.isTruncated).toBe(true);
    expect(scan.files.map((file) => file.path)).toEqual(['app/a.ts', 'app/b.ts']);
  });

  it('treats "." and "./app/" as the project root and the app directory', async () => {
    const files = { 'app/a.ts': 'a', 'root.ts': 'root' };

    const wholeProject = await sourceFixture(files, { relativeRoot: '.' }).scan();
    const app = await sourceFixture(files, { relativeRoot: './app/' }).scan();

    expect(wholeProject.files.map((file) => file.path)).toEqual(['app/a.ts', 'root.ts']);
    expect(app.files.map((file) => file.path)).toEqual(['app/a.ts']);
    expect(sourceFixture(files, { relativeRoot: './app/' }).relativeRoot).toBe('app');
  });

  it('returns nothing for a root that does not exist', async () => {
    const scan = await sourceFixture({ 'app/a.ts': 'a' }, { relativeRoot: 'missing' }).scan();

    expect(scan).toEqual({ files: [], isTruncated: false, skippedCount: 0 });
  });
});

describe('SourceCheckout.readText', () => {
  it('returns undefined for a file that is not there', async () => {
    expect(await sourceFixture({}).readText('app/package.json')).toBeUndefined();
  });
});

describe('SourceCheckout.findDirectoryWith', () => {
  it('finds the file in the root, in a parent, or at the project root', async () => {
    expect(await sourceFixture({ 'app/lock.json': '{}' }).findDirectoryWith('lock.json')).toBe('app');
    expect(
      await sourceFixture(
        { 'packages/lock.json': '{}' },
        { relativeRoot: 'packages/web/app' },
      ).findDirectoryWith('lock.json'),
    ).toBe('packages');
    expect(await sourceFixture({ 'lock.json': '{}' }).findDirectoryWith('lock.json')).toBe('');
  });

  it('returns undefined when no directory up to the project root has the file', async () => {
    expect(await sourceFixture({ 'app/a.ts': 'a' }).findDirectoryWith('lock.json')).toBeUndefined();
    expect(
      await sourceFixture({ 'a.ts': 'a' }, { relativeRoot: '.' }).findDirectoryWith('lock.json'),
    ).toBeUndefined();
  });
});

describe('SourceCheckout.absoluteDirectory', () => {
  it('names the project root and a subdirectory', () => {
    const source = sourceFixture({});

    expect(source.absoluteDirectory('')).toBe('project');
    expect(source.absoluteDirectory('app')).toBe(join('project', 'app'));
  });
});
