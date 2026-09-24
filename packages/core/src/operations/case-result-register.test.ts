// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { RunResult } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { createSequentialIdGenerator } from '../test-support/fake-id-generator.js';
import { runRegisterCaseResult } from './case-result-register.js';
import { createFakeFileSystem, type FakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';

const NOW = new Date('2026-09-25T10:00:00.000Z');

function createContext(): { readonly context: EngineContext; readonly fs: FakeFileSystem } {
  const fs = createFakeFileSystem();
  return { context: createFakeEngineContext({ fs, clock: { now: () => NOW } }), fs };
}

describe('runRegisterCaseResult', () => {
  it('registers a passed run result and returns its path', async () => {
    const { context, fs } = createContext();

    const result = await runRegisterCaseResult(context, {
      testCaseId: 'login-case',
      testType: 'e2e',
      runId: 'run-1',
      status: 'passed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: ['evidence-1', 'evidence-2'],
      idGenerator: createSequentialIdGenerator('id'),
    });

    expect(result).toEqual({ runResultPath: 'runs/login-case/run-result-id-1.json', id: 'run-result-id-1' });
    const written = JSON.parse(
      String(fs.getRawFile(join('project', '.qa', 'runs', 'login-case', 'run-result-id-1.json'))),
    ) as RunResult;
    expect(written).toEqual({
      schemaVersion: 1,
      id: 'run-result-id-1',
      runId: 'run-1',
      testCaseId: 'login-case',
      testType: 'e2e',
      status: 'passed',
      startedAt: '2026-09-25T09:59:00.000Z',
      finishedAt: '2026-09-25T10:00:00.000Z',
      evidenceIds: ['evidence-1', 'evidence-2'],
    });
  });

  it('registers the run result in the manifest', async () => {
    const { context, fs } = createContext();

    const result = await runRegisterCaseResult(context, {
      testCaseId: 'login-case',
      testType: 'e2e',
      runId: 'run-1',
      status: 'passed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: [],
    });

    const manifest = JSON.parse(String(fs.getRawFile(join('project', '.qa', 'manifest.json')))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts).toHaveProperty(result.runResultPath);
  });

  it('accepts a failed status with a failure record', async () => {
    const { context, fs } = createContext();

    const result = await runRegisterCaseResult(context, {
      testCaseId: 'login-case',
      testType: 'e2e',
      runId: 'run-1',
      status: 'failed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: ['evidence-1'],
      failure: { message: 'The login page did not redirect to /dashboard' },
    });

    const written = JSON.parse(
      String(fs.getRawFile(join('project', '.qa', result.runResultPath))),
    ) as RunResult;
    expect(written.failure).toEqual({ message: 'The login page did not redirect to /dashboard' });
  });

  it('rejects a failed status with no failure record', async () => {
    const { context } = createContext();

    await expect(
      runRegisterCaseResult(context, {
        testCaseId: 'login-case',
        testType: 'e2e',
        runId: 'run-1',
        status: 'failed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: [],
      }),
    ).rejects.toThrow();
  });
});
