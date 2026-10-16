// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';

const operations = vi.hoisted(() => ({
  rename: vi.fn<(from: string, to: string) => Promise<void>>(),
  rm: vi.fn<(path: string, options: unknown) => Promise<void>>(),
  writeFile: vi.fn<(path: string, content: unknown, options?: unknown) => Promise<void>>(),
}));

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  ...operations,
}));

const { nodeFileSystem } = await import('./file-system.js');

function busy(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe('nodeFileSystem.writeFile when the target is briefly in use', () => {
  beforeEach(() => {
    operations.rename.mockReset();
    operations.rm.mockReset().mockResolvedValue(undefined);
    operations.writeFile.mockReset().mockResolvedValue(undefined);
  });

  it('retries the rename until the reader lets go', async () => {
    operations.rename
      .mockRejectedValueOnce(busy('EPERM'))
      .mockRejectedValueOnce(busy('EBUSY'))
      .mockResolvedValueOnce(undefined);

    await nodeFileSystem.writeFile('target.json', 'content');

    expect(operations.rename).toHaveBeenCalledTimes(3);
    expect(operations.rm).not.toHaveBeenCalled();
  });

  it('gives up after repeated attempts, removing the temporary file and reporting the error', async () => {
    operations.rename.mockRejectedValue(busy('EACCES'));

    await expect(nodeFileSystem.writeFile('target.json', 'content')).rejects.toThrow('EACCES');

    expect(operations.rename).toHaveBeenCalledTimes(20);
    expect(operations.rm).toHaveBeenCalledTimes(1);
  });

  it('does not retry an error that is not about the file being in use', async () => {
    operations.rename.mockRejectedValue(busy('ENOSPC'));

    await expect(nodeFileSystem.writeFile('target.json', 'content')).rejects.toThrow('ENOSPC');

    expect(operations.rename).toHaveBeenCalledTimes(1);
  });

  it('does not retry a failure that carries no code', async () => {
    operations.rename.mockRejectedValue(new Error('plain'));

    await expect(nodeFileSystem.writeFile('target.json', 'content')).rejects.toThrow('plain');

    expect(operations.rename).toHaveBeenCalledTimes(1);
  });
});
