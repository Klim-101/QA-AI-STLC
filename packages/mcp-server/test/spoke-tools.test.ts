// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTempDir } from '@qa-ai-stlc/test-utils/temp-dir';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spokeListTool } from '../src/tools/spoke-list.js';
import { spokeRecordInputTool } from '../src/tools/spoke-record-input.js';
import { spokeRecordOutputTool } from '../src/tools/spoke-record-output.js';

// Like the other engine-tool tests: the tools build their context from the working directory, so
// each test runs inside a real temporary project directory.
describe('spoke I/O tools (real filesystem, temp project directory)', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it('records a dispatch, its retry and their outputs, and lists them (P4-01)', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);

      const first = await spokeRecordInputTool.handler({
        runId: 'run-1',
        spokeId: 'explorer-page',
        taskId: 'page-1',
        task: 'Analyze the dashboard page',
        context: { url: 'https://example.com/dashboard' },
      });
      const invalid = await spokeRecordOutputTool.handler({
        runId: 'run-1',
        attempt: first.attempt,
        result: {
          schemaVersion: 1,
          spokeId: 'explorer-page',
          taskId: 'page-1',
          status: 'error',
          error: { code: 'SPOKE_RESULT_INVALID', message: 'Payload failed validation.' },
        },
      });
      const retry = await spokeRecordInputTool.handler({
        runId: 'run-1',
        spokeId: 'explorer-page',
        taskId: 'page-1',
        task: 'Analyze the dashboard page',
      });
      await spokeRecordOutputTool.handler({
        runId: 'run-1',
        attempt: retry.attempt,
        result: { schemaVersion: 1, spokeId: 'explorer-page', taskId: 'page-1', status: 'ok', payload: {} },
      });
      const listed = await spokeListTool.handler({ runId: 'run-1' });
      const stored = await readFile(join(projectRoot, '.qa', first.inputPath), 'utf-8');
      process.chdir(originalCwd);

      expect([first.attempt, retry.attempt]).toEqual([1, 2]);
      expect(invalid.status).toBe('error');
      expect(listed.records.map((record) => [record.attempt, record.status])).toEqual([
        [1, 'error'],
        [2, 'ok'],
      ]);
      expect(stored).toContain('https://example.com/dashboard');
    });
  });

  it('refuses an output that has no recorded input, with a code the hub can act on', async () => {
    await withTempDir(async (projectRoot) => {
      process.chdir(projectRoot);

      const error = await spokeRecordOutputTool
        .handler({
          runId: 'run-1',
          attempt: 1,
          result: { schemaVersion: 1, spokeId: 'explorer-page', taskId: 'page-1', status: 'ok', payload: {} },
        })
        .catch((caught: unknown) => caught);
      process.chdir(originalCwd);

      expect(error).toMatchObject({ code: 'SPOKE_OUTPUT_WITHOUT_INPUT' });
    });
  });
});
