// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createFakeFileSystem } from './fake-file-system.js';

describe('createFakeFileSystem', () => {
  it('reads back a file written as text', async () => {
    const fs = createFakeFileSystem();
    await fs.writeFile('/a.txt', 'hello');

    expect(await fs.readFile('/a.txt')).toBe('hello');
  });

  it('decodes bytes written with writeFile back to text on readFile', async () => {
    const fs = createFakeFileSystem();
    await fs.writeFile('/a.bin', new Uint8Array([104, 105]));

    expect(await fs.readFile('/a.bin')).toBe('hi');
  });

  it('rejects readFile with ENOENT for a missing file', async () => {
    const fs = createFakeFileSystem();

    await expect(fs.readFile('/missing')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports pathExists for files, directories and neither', async () => {
    const fs = createFakeFileSystem({ '/a.txt': 'hello' });
    await fs.mkdir('/dir');

    expect(await fs.pathExists('/a.txt')).toBe(true);
    expect(await fs.pathExists('/dir')).toBe(true);
    expect(await fs.pathExists('/missing')).toBe(false);
  });

  it('lists only files whose path is under the given directory', async () => {
    const fs = createFakeFileSystem();
    await fs.writeFile('/a/b.txt', 'b');
    await fs.writeFile('/ab.txt', 'shares the prefix but is not under /a');
    await fs.writeFile('/other/c.txt', 'does not share the prefix at all');

    await expect(fs.listFiles('/a')).resolves.toEqual(['/a/b.txt']);
  });
});
