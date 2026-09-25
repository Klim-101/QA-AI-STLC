// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { SCHEMA_VERSION, type TestCase } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { QaError } from '../errors.js';
import type { EngineContext } from '../engine-context.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { createSequentialIdGenerator } from '../test-support/fake-id-generator.js';
import { runRegisterCaseResult } from './case-result-register.js';
import { runHttpExecute } from './http-execute.js';
import { findLatestProvenSession, runFindProvenSession } from './proven-session.js';
import { createFakeFileSystem, type FakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';

const NOW = new Date('2026-09-25T10:00:00.000Z');

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

const testCase: TestCase = {
  schemaVersion: SCHEMA_VERSION,
  id: 'login-valid-credentials',
  feature: 'login',
  requirementIds: ['req-1'],
  testType: 'api',
  title: 'A registered user can log in',
  steps: [
    { description: 'POST valid credentials to /login' },
    { description: 'GET /profile with the token' },
  ],
  expectedResult: 'The profile endpoint returns the user',
  status: 'approved',
  createdAt: '2026-09-25T09:00:00.000Z',
};

function createContext(): { readonly context: EngineContext; readonly fs: FakeFileSystem } {
  const fs = createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG_YAML });
  return { context: createFakeEngineContext({ fs, clock: { now: () => NOW } }), fs };
}

async function executeAndRegister(
  context: EngineContext,
  runId: string,
  startedAt: string,
  finishedAt: Date = NOW,
): Promise<void> {
  const httpClient = createFakeHttpClient({ ok: true, status: 200, bodyText: '{}' });
  const contextWithHttp: EngineContext = { ...context, httpClient, clock: { now: () => finishedAt } };

  const first = await runHttpExecute(contextWithHttp, {
    runId,
    url: 'https://staging.example.test/login',
    method: 'POST',
    stepId: 'step-1',
    idGenerator: createSequentialIdGenerator(`${runId}-evidence-a`),
  });
  const second = await runHttpExecute(contextWithHttp, {
    runId,
    url: 'https://staging.example.test/profile',
    stepId: 'step-2',
    idGenerator: createSequentialIdGenerator(`${runId}-evidence-b`),
  });

  await runRegisterCaseResult(contextWithHttp, {
    testCaseId: testCase.id,
    testType: 'api',
    runId,
    status: 'passed',
    startedAt,
    evidenceIds: [first.evidence.id, second.evidence.id],
    idGenerator: createSequentialIdGenerator(`${runId}-result`),
  });
}

describe('findLatestProvenSession', () => {
  it('recovers proven steps from a passing session, grouped and ordered by stepId', async () => {
    const { context } = createContext();
    await executeAndRegister(context, 'run-1', '2026-09-25T09:59:00.000Z');

    const session = await findLatestProvenSession(context, testCase, { testCaseId: testCase.id });

    expect(session?.steps.map((step) => step.stepId)).toEqual(['step-1', 'step-2']);
    expect(session?.steps[0]?.description).toBe('POST valid credentials to /login');
    expect(session?.steps[0]?.actions).toHaveLength(1);
  });

  it('returns undefined when the case has no run results at all', async () => {
    const { context } = createContext();

    const session = await findLatestProvenSession(context, testCase, { testCaseId: testCase.id });

    expect(session).toBeUndefined();
  });

  it('returns undefined when the only run result did not pass', async () => {
    const { context } = createContext();
    await runRegisterCaseResult(context, {
      testCaseId: testCase.id,
      testType: 'api',
      runId: 'run-1',
      status: 'failed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: [],
      failure: { message: 'The profile endpoint returned 401' },
    });

    const session = await findLatestProvenSession(context, testCase, { testCaseId: testCase.id });

    expect(session).toBeUndefined();
  });

  it('returns undefined when a passing session exists but its evidence predates the stepId convention', async () => {
    const { context } = createContext();
    const httpClient = createFakeHttpClient({ ok: true, status: 200, bodyText: '{}' });
    const contextWithHttp: EngineContext = { ...context, httpClient };
    const result = await runHttpExecute(contextWithHttp, {
      runId: 'run-1',
      url: 'https://staging.example.test/login',
      method: 'POST',
    });
    await runRegisterCaseResult(context, {
      testCaseId: testCase.id,
      testType: 'api',
      runId: 'run-1',
      status: 'passed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: [result.evidence.id],
    });

    const session = await findLatestProvenSession(context, testCase, { testCaseId: testCase.id });

    expect(session).toBeUndefined();
  });

  it('picks the most recently finished passing session when several exist', async () => {
    const { context } = createContext();
    await executeAndRegister(
      context,
      'run-1',
      '2026-09-25T08:00:00.000Z',
      new Date('2026-09-25T08:05:00.000Z'),
    );
    await executeAndRegister(
      context,
      'run-2',
      '2026-09-25T09:00:00.000Z',
      new Date('2026-09-25T09:05:00.000Z'),
    );

    const session = await findLatestProvenSession(context, testCase, { testCaseId: testCase.id });

    expect(session?.runResultId).toBe('run-result-run-2-result-1');
  });

  it('throws when evidence references a step the case no longer has, after the case was edited', async () => {
    const { context } = createContext();
    await executeAndRegister(context, 'run-1', '2026-09-25T09:59:00.000Z');
    const shrunkCase: TestCase = { ...testCase, steps: [testCase.steps[0]!] };

    await expect(
      findLatestProvenSession(context, shrunkCase, { testCaseId: testCase.id }),
    ).rejects.toBeInstanceOf(QaError);
  });

  it('keeps the already-found latest when an earlier-finishing result is read after it', async () => {
    const { context } = createContext();
    await context.fs.mkdir(join('project', '.qa', 'runs', testCase.id));
    await context.fs.writeFile(
      join('project', '.qa', 'runs', testCase.id, 'result-later.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'result-later',
        runId: 'run-later',
        testCaseId: testCase.id,
        testType: 'api',
        status: 'passed',
        startedAt: '2026-09-25T09:00:00.000Z',
        finishedAt: '2026-09-25T09:05:00.000Z',
        evidenceIds: [],
      }),
    );
    await context.fs.writeFile(
      join('project', '.qa', 'runs', testCase.id, 'result-earlier.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'result-earlier',
        runId: 'run-earlier',
        testCaseId: testCase.id,
        testType: 'api',
        status: 'passed',
        startedAt: '2026-09-25T08:00:00.000Z',
        finishedAt: '2026-09-25T08:05:00.000Z',
        evidenceIds: [],
      }),
    );

    const session = await findLatestProvenSession(context, testCase, { testCaseId: testCase.id });

    // Both results have no proven-step evidence, so the session itself is undefined either way;
    // this test exists to exercise the reduce's "keep the accumulator" branch in file-listing
    // order (result-later.json written first), not to assert which result "won".
    expect(session).toBeUndefined();
  });

  it('skips an evidenceId with no matching file on disk, a dangling reference', async () => {
    const { context } = createContext();
    await seedRunResult(context, 'run-1', ['evidence-missing']);

    const session = await findLatestProvenSession(context, testCase, { testCaseId: testCase.id });

    expect(session).toBeUndefined();
  });

  it('skips evidence content that is not valid JSON', async () => {
    const { context } = createContext();
    await seedRunResult(context, 'run-1', ['evidence-1']);
    await seedEvidenceFile(context, 'run-1', 'evidence-1', 'not json');

    const session = await findLatestProvenSession(context, testCase, { testCaseId: testCase.id });

    expect(session).toBeUndefined();
  });

  it('skips evidence content that is valid JSON but matches neither proven action shape', async () => {
    const { context } = createContext();
    await seedRunResult(context, 'run-1', ['evidence-1']);
    await seedEvidenceFile(context, 'run-1', 'evidence-1', JSON.stringify({ unrelated: true }));

    const session = await findLatestProvenSession(context, testCase, { testCaseId: testCase.id });

    expect(session).toBeUndefined();
  });

  it('throws when a stepId does not follow the "step-<N>" convention', async () => {
    const { context } = createContext();
    await seedRunResult(context, 'run-1', ['evidence-1']);
    await seedEvidenceFile(
      context,
      'run-1',
      'evidence-1',
      JSON.stringify({
        type: 'click',
        sessionId: 'session-1',
        stepId: 'first-step',
        at: '2026-09-25T09:59:30.000Z',
      }),
    );

    await expect(
      findLatestProvenSession(context, testCase, { testCaseId: testCase.id }),
    ).rejects.toBeInstanceOf(QaError);
  });

  it('throws when a stepId has a non-canonical numeric suffix', async () => {
    const { context } = createContext();
    await seedRunResult(context, 'run-1', ['evidence-1']);
    await seedEvidenceFile(
      context,
      'run-1',
      'evidence-1',
      JSON.stringify({
        type: 'click',
        sessionId: 'session-1',
        stepId: 'step-01',
        at: '2026-09-25T09:59:30.000Z',
      }),
    );

    await expect(
      findLatestProvenSession(context, testCase, { testCaseId: testCase.id }),
    ).rejects.toBeInstanceOf(QaError);
  });
});

async function seedRunResult(
  context: EngineContext,
  runId: string,
  evidenceIds: readonly string[],
): Promise<void> {
  await context.fs.mkdir(join('project', '.qa', 'runs', testCase.id));
  await context.fs.writeFile(
    join('project', '.qa', 'runs', testCase.id, 'result.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'result',
      runId,
      testCaseId: testCase.id,
      testType: 'api',
      status: 'passed',
      startedAt: '2026-09-25T09:59:00.000Z',
      finishedAt: '2026-09-25T09:59:59.000Z',
      evidenceIds,
    }),
  );
}

async function seedEvidenceFile(
  context: EngineContext,
  runId: string,
  evidenceId: string,
  content: string,
): Promise<void> {
  await context.fs.mkdir(join('project', '.qa', 'evidence', runId));
  await context.fs.writeFile(join('project', '.qa', 'evidence', runId, `${evidenceId}.json`), content);
}

async function seedCase(context: EngineContext): Promise<void> {
  await context.fs.mkdir(join('project', '.qa', 'artifacts', 'cases', 'login'));
  await context.fs.writeFile(
    join('project', '.qa', 'artifacts', 'cases', 'login', `${testCase.id}.json`),
    JSON.stringify(testCase),
  );
}

describe('runFindProvenSession', () => {
  it('reports found: false when the case has no proven session', async () => {
    const { context } = createContext();
    await seedCase(context);

    const result = await runFindProvenSession(context, { testCaseId: testCase.id });

    expect(result).toEqual({ found: false });
  });

  it('reports found: true with the recovered session when one exists', async () => {
    const { context } = createContext();
    await seedCase(context);
    await executeAndRegister(context, 'run-1', '2026-09-25T09:59:00.000Z');

    const result = await runFindProvenSession(context, { testCaseId: testCase.id });

    expect(result.found).toBe(true);
    expect(result.found && result.session.steps).toHaveLength(2);
  });
});
