// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { nodeProcessRunner } from './process-runner.js';

describe('nodeProcessRunner', () => {
  it('resolves with exit code 0 and captured stdout on success', async () => {
    const result = await nodeProcessRunner.run(process.execPath, ['-e', 'console.log("hello")']);

    expect(result).toEqual({ exitCode: 0, stdout: 'hello\n', stderr: '' });
  });

  it('resolves with the real nonzero exit code, not a rejection', async () => {
    const result = await nodeProcessRunner.run(process.execPath, ['-e', 'process.exit(7)']);

    expect(result.exitCode).toBe(7);
  });

  it('rejects when the command itself cannot be spawned', async () => {
    await expect(nodeProcessRunner.run('qa-ai-stlc-command-that-does-not-exist', [])).rejects.toThrow();
  });
});
