// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createFakeFileSystem } from './fake-file-system.js';

describe('createFakeFileSystem', () => {
  it('rejects readFile with an ENOENT error for a file never written', async () => {
    const fs = createFakeFileSystem();

    await expect(fs.readFile('/missing.txt')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('decodes bytes written with writeFile back to text on readFile', async () => {
    const fs = createFakeFileSystem();
    await fs.writeFile('/a.bin', new Uint8Array([104, 105]));

    expect(await fs.readFile('/a.bin')).toBe('hi');
  });

  it('readBytes returns raw bytes for content written as bytes, unchanged', async () => {
    const fs = createFakeFileSystem();
    const bytes = new Uint8Array([137, 80, 78, 71]);
    await fs.writeFile('/a.bin', bytes);

    expect(await fs.readBytes('/a.bin')).toEqual(bytes);
  });

  it('readBytes UTF-8-encodes content written as text', async () => {
    const fs = createFakeFileSystem();
    await fs.writeFile('/a.txt', 'hi');

    expect(new Uint8Array(await fs.readBytes('/a.txt'))).toEqual(new Uint8Array([104, 105]));
  });

  it('rejects readBytes with an ENOENT error for a file never written', async () => {
    const fs = createFakeFileSystem();

    await expect(fs.readBytes('/missing.txt')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('getRawFile returns exactly what was written, bytes or text', async () => {
    const fs = createFakeFileSystem();
    const bytes = new Uint8Array([1, 2, 3]);
    await fs.writeFile('/a.bin', bytes);
    await fs.writeFile('/a.txt', 'hello');

    expect(fs.getRawFile('/a.bin')).toEqual(bytes);
    expect(fs.getRawFile('/a.txt')).toBe('hello');
    expect(fs.getRawFile('/missing')).toBeUndefined();
  });

  it('lists only files whose path is under the given directory', async () => {
    const fs = createFakeFileSystem();
    await fs.writeFile('/a/b.txt', 'b');
    await fs.writeFile('/ab.txt', 'shares the prefix but is not under /a');
    await fs.writeFile('/other/c.txt', 'does not share the prefix at all');

    await expect(fs.listFiles('/a')).resolves.toEqual(['/a/b.txt']);
  });
});
