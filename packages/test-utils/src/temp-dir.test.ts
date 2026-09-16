// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { withTempDir } from './temp-dir.js';

describe('withTempDir', () => {
  it('provides a directory that exists during use and is removed afterward', async () => {
    let capturedPath = '';
    await withTempDir(async (directoryPath) => {
      capturedPath = directoryPath;
      await expect(access(directoryPath)).resolves.toBeUndefined();
    });
    await expect(access(capturedPath)).rejects.toThrow();
  });

  it('removes the directory even when use throws', async () => {
    let capturedPath = '';
    await expect(
      withTempDir((directoryPath) => {
        capturedPath = directoryPath;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(access(capturedPath)).rejects.toThrow();
  });
});
