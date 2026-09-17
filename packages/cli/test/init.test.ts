// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import { EXIT_SUCCESS } from '../src/exit-codes.js';

const noopIo = { stdout: () => undefined, stderr: () => undefined };

// Exercises "qa init" against a real disk, the CLI boundary AGENTS.md section 4 requires an
// integration test for, to prove it produces the documented layout (development plan section
// 3.2) rather than only the layout a fake filesystem is told to accept.
describe('qa init (integration)', () => {
  it('produces the documented .qa/ layout on an empty folder', async () => {
    await withTempDir(async (projectRoot) => {
      const exitCode = await runCli(['init'], { io: noopIo, projectRoot });

      expect(exitCode).toBe(EXIT_SUCCESS);
      const qaDir = join(projectRoot, '.qa');
      await expect(stat(join(qaDir, 'config.yaml'))).resolves.toBeDefined();
      await expect(stat(join(qaDir, '.gitignore'))).resolves.toBeDefined();
      for (const name of ['artifacts', 'selectors', 'runs', 'evidence', 'reports']) {
        const entry = await stat(join(qaDir, name));
        expect(entry.isDirectory()).toBe(true);
      }
    });
  });
});
