// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { RunResult } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { EvidenceStore } from '../evidence-store.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { createSequentialIdGenerator } from '../test-support/fake-id-generator.js';
import { runRegisterCaseResult } from './case-result-register.js';
import { createFakeFileSystem, type FakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';

const NOW = new Date('2026-09-25T10:00:00.000Z');
const CASE_ID = 'login-case';

function createContext(): { readonly context: EngineContext; readonly fs: FakeFileSystem } {
  const fs = createFakeFileSystem();
  return { context: createFakeEngineContext({ fs, clock: { now: () => NOW } }), fs };
}

/** Registers a real, findable `TestCase` under `artifacts/cases/<feature>/<id>.json` so `runRegisterCaseResult` accepts `testCaseId`. */
async function seedCase(fs: FakeFileSystem, id: string = CASE_ID): Promise<void> {
  await fs.mkdir(join('project', '.qa', 'artifacts', 'cases', 'login'));
  await fs.writeFile(
    join('project', '.qa', 'artifacts', 'cases', 'login', `${id}.json`),
    JSON.stringify({
      schemaVersion: 1,
      id,
      feature: 'login',
      requirementIds: [],
      testType: 'e2e',
      title: 'A registered user can log in',
      steps: [{ description: 'Submit valid credentials' }],
      expectedResult: 'The dashboard loads',
      status: 'approved',
      createdAt: '2026-09-25T09:00:00.000Z',
    }),
  );
}

/** Registers real evidence under `evidence/<runId>/` through the same store `runRegisterCaseResult` reads back. */
async function seedEvidence(context: EngineContext, runId: string, id: string): Promise<void> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const evidenceStore = new EvidenceStore({ store, manifest, clock: context.clock });
  const registration = await evidenceStore.register({
    id,
    runId,
    kind: 'screenshot',
    content: new Uint8Array([1, 2, 3]),
  });
  if (registration.status !== 'registered') {
    throw new Error('Test setup expected evidence to register cleanly.');
  }
}

describe('runRegisterCaseResult', () => {
  it('registers a passed run result and returns its path', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedEvidence(context, 'run-1', 'evidence-1');
    await seedEvidence(context, 'run-1', 'evidence-2');

    const result = await runRegisterCaseResult(context, {
      testCaseId: CASE_ID,
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
    await seedCase(fs);
    await seedEvidence(context, 'run-1', 'evidence-1');

    const result = await runRegisterCaseResult(context, {
      testCaseId: CASE_ID,
      testType: 'e2e',
      runId: 'run-1',
      status: 'passed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: ['evidence-1'],
    });

    const manifest = JSON.parse(String(fs.getRawFile(join('project', '.qa', 'manifest.json')))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts).toHaveProperty(result.runResultPath);
  });

  it('accepts a failed status with a failure record and no evidence', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);

    const result = await runRegisterCaseResult(context, {
      testCaseId: CASE_ID,
      testType: 'e2e',
      runId: 'run-1',
      status: 'failed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: [],
      failure: { message: 'The login page did not redirect to /dashboard' },
    });

    const written = JSON.parse(
      String(fs.getRawFile(join('project', '.qa', result.runResultPath))),
    ) as RunResult;
    expect(written.failure).toEqual({ message: 'The login page did not redirect to /dashboard' });
  });

  it('rejects a failed status with no failure record', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);

    await expect(
      runRegisterCaseResult(context, {
        testCaseId: CASE_ID,
        testType: 'e2e',
        runId: 'run-1',
        status: 'failed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: [],
      }),
    ).rejects.toThrow();
  });

  it('rejects a testCaseId with no registered test case', async () => {
    const { context } = createContext();

    await expect(
      runRegisterCaseResult(context, {
        testCaseId: 'no-such-case',
        testType: 'e2e',
        runId: 'run-1',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: [],
      }),
    ).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
  });

  it('rejects an evidenceId registered under a different run', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedEvidence(context, 'run-other', 'evidence-1');

    await expect(
      runRegisterCaseResult(context, {
        testCaseId: CASE_ID,
        testType: 'e2e',
        runId: 'run-1',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: ['evidence-1'],
      }),
    ).rejects.toMatchObject({ code: 'RUN_RESULT_UNRESOLVED_EVIDENCE' });
  });

  it('rejects an evidenceId that was never registered at all', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);

    await expect(
      runRegisterCaseResult(context, {
        testCaseId: CASE_ID,
        testType: 'e2e',
        runId: 'run-1',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: ['evidence-fabricated'],
      }),
    ).rejects.toMatchObject({ code: 'RUN_RESULT_UNRESOLVED_EVIDENCE' });
  });

  it('rejects a passed status with zero evidence', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);

    const error = await runRegisterCaseResult(context, {
      testCaseId: CASE_ID,
      testType: 'e2e',
      runId: 'run-1',
      status: 'passed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: [],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QaError);
    expect((error as QaError).code).toBe('RUN_RESULT_MISSING_EVIDENCE');
  });
});
