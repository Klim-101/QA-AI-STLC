// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import { EXIT_FAILURE, EXIT_SUCCESS } from '../src/exit-codes.js';

const noopIo = { stdout: () => undefined, stderr: () => undefined };

// Exercises "qa init" against a real disk, the CLI boundary AGENTS.md section 4 requires an
// integration test for, to prove it produces the documented layout (development plan section
// 3.2) rather than only the layout a fake filesystem is told to accept.
describe('qa init (integration)', () => {
  it('produces the documented .qa/ layout once every testing type is answered', async () => {
    await withTempDir(async (projectRoot) => {
      const exitCode = await runCli(
        [
          'init',
          '--e2e',
          'in-scope',
          '--api',
          'out-of-scope',
          '--a11y',
          'out-of-scope',
          '--security',
          'out-of-scope',
        ],
        { io: noopIo, projectRoot },
      );

      expect(exitCode).toBe(EXIT_SUCCESS);
      const qaDir = join(projectRoot, '.qa');
      await expect(stat(join(qaDir, 'config.yaml'))).resolves.toBeDefined();
      await expect(stat(join(qaDir, '.gitignore'))).resolves.toBeDefined();
      for (const name of ['artifacts', 'selectors', 'runs', 'evidence', 'reports']) {
        const entry = await stat(join(qaDir, name));
        expect(entry.isDirectory()).toBe(true);
      }
      const written = parseYaml(await readFile(join(qaDir, 'config.yaml'), 'utf8')) as { testing: unknown };
      expect(written.testing).toStrictEqual({
        e2e: 'in-scope',
        api: 'out-of-scope',
        a11y: 'out-of-scope',
        security: 'out-of-scope',
      });
    });
  });

  it('fails when a testing type is left unanswered and --defer-scope is not given', async () => {
    await withTempDir(async (projectRoot) => {
      const exitCode = await runCli(['init'], { io: noopIo, projectRoot });

      expect(exitCode).toBe(EXIT_FAILURE);
      await expect(stat(join(projectRoot, '.qa', 'config.yaml'))).rejects.toThrow();
    });
  });

  it('leaves every unanswered type "undecided" when --defer-scope is given', async () => {
    await withTempDir(async (projectRoot) => {
      const exitCode = await runCli(['init', '--defer-scope'], { io: noopIo, projectRoot });

      expect(exitCode).toBe(EXIT_SUCCESS);
      const written = parseYaml(await readFile(join(projectRoot, '.qa', 'config.yaml'), 'utf8')) as {
        testing: unknown;
      };
      expect(written.testing).toStrictEqual({
        e2e: 'undecided',
        api: 'undecided',
        a11y: 'undecided',
        security: 'undecided',
      });
    });
  });
});
