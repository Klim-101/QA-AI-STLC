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
      requirementIds: ['login'],
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

/** Registers an `expect` action record the way `qa.browser_expect` does, so the run holds a real verdict. */
async function seedExpectation(
  context: EngineContext,
  runId: string,
  id: string,
  options: {
    readonly passed: boolean;
    readonly at: string;
    readonly stepId?: string;
    readonly selector?: string;
    readonly ref?: { readonly id: string; readonly role: string };
    readonly type?: string;
    readonly raw?: string;
  },
): Promise<void> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const evidenceStore = new EvidenceStore({ store, manifest, clock: context.clock });
  const registration = await evidenceStore.register({
    id,
    runId,
    kind: 'action',
    stepId: options.stepId ?? 'step-1',
    content:
      options.raw ??
      JSON.stringify({
        schemaVersion: 1,
        type: options.type ?? 'expect',
        sessionId: 'session-1',
        stepId: options.stepId ?? 'step-1',
        ...(options.ref === undefined ? { selector: options.selector ?? '#done' } : { ref: options.ref }),
        expectation: { kind: 'visible', passed: options.passed },
        at: options.at,
      }),
  });
  if (registration.status !== 'registered') {
    throw new Error('Test setup expected evidence to register cleanly.');
  }
}

describe('runRegisterCaseResult', () => {
  it('registers a passed run result and returns its path', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedExpectation(context, 'run-1', 'evidence-1', { passed: true, at: '2026-09-25T09:59:30.000Z' });
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
    await seedExpectation(context, 'run-1', 'evidence-1', { passed: true, at: '2026-09-25T09:59:30.000Z' });

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

  describe('partial results (P6-91)', () => {
    const register = (
      context: EngineContext,
      overrides: Partial<Parameters<typeof runRegisterCaseResult>[1]>,
    ): ReturnType<typeof runRegisterCaseResult> =>
      runRegisterCaseResult(context, {
        testCaseId: CASE_ID,
        testType: 'e2e',
        runId: 'run-1',
        status: 'partial',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: [],
        ...overrides,
      });

    it('registers a partial result with the steps that were not done, once each', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);

      const result = await register(context, { missingStepIds: ['expected-result', 'step-1', 'step-1'] });

      const written = JSON.parse(
        String(fs.getRawFile(join('project', '.qa', result.runResultPath))),
      ) as RunResult;
      expect(written).toMatchObject({
        status: 'partial',
        missingStepIds: ['expected-result', 'step-1'],
      });
    });

    it.each([[undefined], [[]]] as const)(
      'requires a partial result to name a step (%j)',
      async (missing) => {
        const { context, fs } = createContext();
        await seedCase(fs);

        await expect(
          register(context, missing === undefined ? {} : { missingStepIds: missing }),
        ).rejects.toMatchObject({ code: 'RUN_RESULT_MISSING_STEPS_REQUIRED' });
      },
    );

    it('refuses an id the case does not have, and lists the ones it does', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);

      const error = await register(context, { missingStepIds: ['step-1', 'step-9'] }).catch(
        (caught: unknown) => caught,
      );

      expect(error).toMatchObject({ code: 'RUN_RESULT_MISSING_STEP_UNKNOWN' });
      expect((error as QaError).message).toContain('step-9');
      expect((error as QaError).remediation).toContain('step-1, expected-result');
    });

    it('refuses the field on any status but partial', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);

      await expect(
        register(context, {
          status: 'uncertain',
          missingStepIds: ['step-1'],
        }),
      ).rejects.toMatchObject({ code: 'RUN_RESULT_MISSING_STEPS_NOT_PARTIAL' });
    });
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

  it('rejects a passed status while the run still holds a failed expectation', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedExpectation(context, 'run-1', 'evidence-1', {
      passed: false,
      at: '2026-09-25T09:59:10.000Z',
      stepId: 'expected-result',
    });

    await expect(
      runRegisterCaseResult(context, {
        testCaseId: CASE_ID,
        testType: 'e2e',
        runId: 'run-1',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: ['evidence-1'],
      }),
    ).rejects.toMatchObject({ code: 'RUN_RESULT_FAILED_EXPECTATION' });
  });

  it('finds the failed expectation even when the caller does not cite it', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedExpectation(context, 'run-1', 'evidence-1', { passed: false, at: '2026-09-25T09:59:10.000Z' });
    await seedEvidence(context, 'run-1', 'evidence-2');

    await expect(
      runRegisterCaseResult(context, {
        testCaseId: CASE_ID,
        testType: 'e2e',
        runId: 'run-1',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: ['evidence-2'],
      }),
    ).rejects.toMatchObject({ code: 'RUN_RESULT_FAILED_EXPECTATION' });
  });

  it('accepts a passed status when a later attempt of the same expectation passed', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedExpectation(context, 'run-1', 'evidence-1', { passed: false, at: '2026-09-25T09:59:10.000Z' });
    await seedExpectation(context, 'run-1', 'evidence-2', { passed: true, at: '2026-09-25T09:59:20.000Z' });

    const result = await runRegisterCaseResult(context, {
      testCaseId: CASE_ID,
      testType: 'e2e',
      runId: 'run-1',
      status: 'passed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: ['evidence-1', 'evidence-2'],
    });

    expect(result.runResultPath).toContain('runs/login-case/');
  });

  it('does not let a pass of a different expectation resolve a failed one', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedExpectation(context, 'run-1', 'evidence-1', {
      passed: false,
      at: '2026-09-25T09:59:10.000Z',
      selector: '#saved',
    });
    await seedExpectation(context, 'run-1', 'evidence-2', {
      passed: true,
      at: '2026-09-25T09:59:20.000Z',
      selector: '#other',
    });

    await expect(
      runRegisterCaseResult(context, {
        testCaseId: CASE_ID,
        testType: 'e2e',
        runId: 'run-1',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: ['evidence-1', 'evidence-2'],
      }),
    ).rejects.toMatchObject({ code: 'RUN_RESULT_FAILED_EXPECTATION' });
  });

  it('still registers a failed status when an expectation failed', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedExpectation(context, 'run-1', 'evidence-1', { passed: false, at: '2026-09-25T09:59:10.000Z' });

    const result = await runRegisterCaseResult(context, {
      testCaseId: CASE_ID,
      testType: 'e2e',
      runId: 'run-1',
      status: 'failed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: ['evidence-1'],
      failure: { message: 'The saved record was not visible.' },
    });

    expect(result.id).toMatch(/^run-result-/);
  });

  it('ignores evidence that is not an expectation record', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedExpectation(context, 'run-1', 'evidence-1', { passed: true, at: 'x', raw: 'not json' });
    await seedExpectation(context, 'run-1', 'evidence-2', {
      passed: true,
      at: '2026-09-25T09:59:10.000Z',
      type: 'click',
    });
    await seedExpectation(context, 'run-1', 'evidence-3', {
      passed: true,
      at: 'x',
      raw: '{"unrelated":true}',
    });
    await seedExpectation(context, 'run-1', 'evidence-4', { passed: true, at: '2026-09-25T09:59:30.000Z' });

    const result = await runRegisterCaseResult(context, {
      testCaseId: CASE_ID,
      testType: 'e2e',
      runId: 'run-1',
      status: 'passed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: ['evidence-1', 'evidence-2', 'evidence-4'],
    });

    expect(result.id).toMatch(/^run-result-/);
  });

  it('judges an expectation by its time, not by the order of its evidence ids', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedExpectation(context, 'run-1', 'evidence-1', { passed: true, at: '2026-09-25T09:59:20.000Z' });
    await seedExpectation(context, 'run-1', 'evidence-2', { passed: false, at: '2026-09-25T09:59:10.000Z' });

    const result = await runRegisterCaseResult(context, {
      testCaseId: CASE_ID,
      testType: 'e2e',
      runId: 'run-1',
      status: 'passed',
      startedAt: '2026-09-25T09:59:00.000Z',
      evidenceIds: ['evidence-1', 'evidence-2'],
    });

    expect(result.id).toMatch(/^run-result-/);
  });

  it('names a ref-targeted failed expectation by its ref', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedExpectation(context, 'run-1', 'evidence-1', {
      passed: false,
      at: '2026-09-25T09:59:10.000Z',
      ref: { id: 'e7', role: 'button' },
    });

    await expect(
      runRegisterCaseResult(context, {
        testCaseId: CASE_ID,
        testType: 'e2e',
        runId: 'run-1',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: ['evidence-1'],
      }),
    ).rejects.toThrow('"e7"');
  });

  it('describes a page-level failed expectation without a target', async () => {
    const { context, fs } = createContext();
    await seedCase(fs);
    await seedExpectation(context, 'run-1', 'evidence-1', {
      passed: false,
      at: '2026-09-25T09:59:10.000Z',
      raw: JSON.stringify({
        schemaVersion: 1,
        type: 'expect',
        sessionId: 'session-1',
        expectation: { kind: 'url', passed: false },
        at: '2026-09-25T09:59:10.000Z',
      }),
    });

    await expect(
      runRegisterCaseResult(context, {
        testCaseId: CASE_ID,
        testType: 'e2e',
        runId: 'run-1',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds: ['evidence-1'],
      }),
    ).rejects.toThrow('on the page');
  });

  describe('what a passed result must prove (#603)', () => {
    const STARTED_AT = '2026-09-25T09:59:00.000Z';

    async function seedTypedCase(
      fs: FakeFileSystem,
      testType: 'e2e' | 'api' | 'a11y',
      stepCount: number,
      id: string = CASE_ID,
    ): Promise<void> {
      await fs.mkdir(join('project', '.qa', 'artifacts', 'cases', 'login'));
      await fs.writeFile(
        join('project', '.qa', 'artifacts', 'cases', 'login', `${id}.json`),
        JSON.stringify({
          schemaVersion: 1,
          id,
          feature: 'login',
          requirementIds: ['login'],
          testType,
          title: 'A case',
          steps: Array.from({ length: stepCount }, (_, index) => ({
            description: `Step ${String(index + 1)}`,
          })),
          expectedResult: 'It works',
          status: 'approved',
          createdAt: '2026-09-25T09:00:00.000Z',
        }),
      );
    }

    async function seedRecord(
      context: EngineContext,
      runId: string,
      id: string,
      record: Readonly<Record<string, unknown>>,
    ): Promise<void> {
      const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
      const manifest = new ManifestStore({ store, clock: context.clock });
      const registration = await new EvidenceStore({ store, manifest, clock: context.clock }).register({
        id,
        runId,
        kind: 'other',
        fileExtension: 'json',
        content: JSON.stringify(record),
      });
      if (registration.status !== 'registered') {
        throw new Error('Test setup expected evidence to register cleanly.');
      }
    }

    const request = (stepId: string | undefined, status: number): Record<string, unknown> => ({
      type: 'http-request',
      ...(stepId === undefined ? {} : { stepId }),
      method: 'GET',
      url: 'https://staging.example.test/x',
      status,
      responseHeaders: {},
      bodyPreview: '',
      truncated: false,
      at: '2026-09-25T09:59:30.000Z',
    });

    const scan = (
      stepId: string | undefined,
      found: { violations?: number; uncertain?: number } = {},
    ): Record<string, unknown> => ({
      type: 'a11y-scan',
      ...(stepId === undefined ? {} : { stepId }),
      axeVersion: '4.0.0',
      configHash: 'a'.repeat(64),
      wcagVersion: '2.1',
      level: 'AA',
      bestPractices: false,
      tags: [],
      include: [],
      exclude: [],
      violations: Array.from({ length: found.violations ?? 0 }, () => ({ id: 'color-contrast' })),
      excepted: [],
      expiredExceptions: [],
      uncertain: Array.from({ length: found.uncertain ?? 0 }, () => ({ id: 'color-contrast' })),
      passedRuleIds: [],
      inapplicableRuleIds: [],
    });

    function registerPassed(
      context: EngineContext,
      testType: 'e2e' | 'api' | 'a11y',
      evidenceIds: readonly string[],
      testCaseId: string = CASE_ID,
    ): Promise<unknown> {
      return runRegisterCaseResult(context, {
        testCaseId,
        testType,
        runId: 'run-1',
        status: 'passed',
        startedAt: STARTED_AT,
        evidenceIds,
      });
    }

    it('refuses passed while a step has no evidence linked to it, naming the step', async () => {
      const { context, fs } = createContext();
      await seedTypedCase(fs, 'e2e', 2);
      await seedExpectation(context, 'run-1', 'evidence-1', { passed: true, at: NOW.toISOString() });

      const error = await registerPassed(context, 'e2e', ['evidence-1']).catch((caught: unknown) => caught);

      expect((error as QaError).code).toBe('RUN_RESULT_STEP_NOT_PROVEN');
      expect((error as QaError).message).toContain('step(s) 2');
    });

    it('refuses passed when no cited evidence is linked to a step, whatever the screenshots say', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);
      await seedEvidence(context, 'run-1', 'evidence-1');

      await expect(registerPassed(context, 'e2e', ['evidence-1'])).rejects.toMatchObject({
        code: 'RUN_RESULT_STEP_NOT_PROVEN',
      });
    });

    it('refuses passed when every step is performed but nothing checks the expected result', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);
      await seedExpectation(context, 'run-1', 'evidence-1', {
        passed: true,
        at: NOW.toISOString(),
        type: 'click',
      });

      await expect(registerPassed(context, 'e2e', ['evidence-1'])).rejects.toMatchObject({
        code: 'RUN_RESULT_EXPECTED_RESULT_UNCHECKED',
      });
    });

    it('does not count a record that carries no step id', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);
      await seedExpectation(context, 'run-1', 'evidence-1', {
        passed: true,
        at: NOW.toISOString(),
        raw: JSON.stringify({
          schemaVersion: 1,
          type: 'expect',
          sessionId: 'session-1',
          selector: '#done',
          expectation: { kind: 'visible', passed: true },
          at: NOW.toISOString(),
        }),
      });

      await expect(registerPassed(context, 'e2e', ['evidence-1'])).rejects.toMatchObject({
        code: 'RUN_RESULT_STEP_NOT_PROVEN',
      });
    });

    it('does not count an a11y scan that carries no step id', async () => {
      const { context, fs } = createContext();
      await seedTypedCase(fs, 'a11y', 1);
      await seedRecord(context, 'run-1', 'evidence-1', scan(undefined));

      await expect(registerPassed(context, 'a11y', ['evidence-1'])).rejects.toMatchObject({
        code: 'RUN_RESULT_STEP_NOT_PROVEN',
      });
    });

    it('does not count a step proven by a blocked tab', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);
      await seedExpectation(context, 'run-1', 'evidence-1', {
        passed: true,
        at: NOW.toISOString(),
        type: 'tab-blocked',
      });

      await expect(registerPassed(context, 'e2e', ['evidence-1'])).rejects.toMatchObject({
        code: 'RUN_RESULT_STEP_NOT_PROVEN',
      });
    });

    it('accepts a complete passing e2e set: every step performed and the expected result checked', async () => {
      const { context, fs } = createContext();
      await seedTypedCase(fs, 'e2e', 2);
      await seedExpectation(context, 'run-1', 'evidence-1', {
        passed: true,
        at: NOW.toISOString(),
        type: 'click',
        stepId: 'step-1',
      });
      await seedExpectation(context, 'run-1', 'evidence-2', {
        passed: true,
        at: NOW.toISOString(),
        stepId: 'step-2',
      });

      await expect(registerPassed(context, 'e2e', ['evidence-1', 'evidence-2'])).resolves.toBeDefined();
    });

    it('ignores records of another test type when judging an e2e case', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);
      await seedRecord(context, 'run-1', 'evidence-1', request('step-1', 200));
      await seedRecord(context, 'run-1', 'evidence-2', scan('step-1'));

      await expect(registerPassed(context, 'e2e', ['evidence-1', 'evidence-2'])).rejects.toMatchObject({
        code: 'RUN_RESULT_STEP_NOT_PROVEN',
      });
    });

    it('accepts an api case whose every step got a response below 400', async () => {
      const { context, fs } = createContext();
      await seedTypedCase(fs, 'api', 2);
      await seedRecord(context, 'run-1', 'evidence-1', request('step-1', 201));
      await seedRecord(context, 'run-1', 'evidence-2', request('step-2', 200));

      await expect(registerPassed(context, 'api', ['evidence-1', 'evidence-2'])).resolves.toBeDefined();
    });

    it('refuses an api case whose request came back with an error status or carries no step id', async () => {
      const { context, fs } = createContext();
      await seedTypedCase(fs, 'api', 2);
      await seedRecord(context, 'run-1', 'evidence-1', request('step-1', 200));
      await seedRecord(context, 'run-1', 'evidence-2', request('step-2', 500));
      await seedRecord(context, 'run-1', 'evidence-3', request(undefined, 200));

      await expect(
        registerPassed(context, 'api', ['evidence-1', 'evidence-2', 'evidence-3']),
      ).rejects.toMatchObject({ code: 'RUN_RESULT_STEP_NOT_PROVEN' });
    });

    it('accepts an a11y case that navigated and then scanned clean', async () => {
      const { context, fs } = createContext();
      await seedTypedCase(fs, 'a11y', 2);
      await seedExpectation(context, 'run-1', 'evidence-1', {
        passed: true,
        at: NOW.toISOString(),
        type: 'navigate',
        stepId: 'step-1',
      });
      await seedRecord(context, 'run-1', 'evidence-2', scan('step-2'));

      await expect(registerPassed(context, 'a11y', ['evidence-1', 'evidence-2'])).resolves.toBeDefined();
    });

    it.each([
      ['violations', { violations: 1 }],
      ['uncertain results', { uncertain: 1 }],
    ])('refuses an a11y case whose scan has %s', async (_label, found) => {
      const { context, fs } = createContext();
      await seedTypedCase(fs, 'a11y', 1);
      await seedRecord(context, 'run-1', 'evidence-1', scan('step-1', found));

      await expect(registerPassed(context, 'a11y', ['evidence-1'])).rejects.toMatchObject({
        code: 'RUN_RESULT_STEP_NOT_PROVEN',
      });
    });

    it('does not let evidence of another run satisfy a step', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);
      await seedExpectation(context, 'run-2', 'evidence-1', { passed: true, at: NOW.toISOString() });

      await expect(registerPassed(context, 'e2e', ['evidence-1'])).rejects.toMatchObject({
        code: 'RUN_RESULT_UNRESOLVED_EVIDENCE',
      });
    });

    it('refuses to reuse a run that already holds a result for another case', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);
      await seedTypedCase(fs, 'e2e', 1, 'other-case');
      await seedExpectation(context, 'run-1', 'evidence-1', { passed: true, at: NOW.toISOString() });
      await registerPassed(context, 'e2e', ['evidence-1']);

      await expect(registerPassed(context, 'e2e', ['evidence-1'], 'other-case')).rejects.toMatchObject({
        code: 'RUN_RESULT_RUN_BOUND_TO_OTHER_CASE',
      });
    });

    it('lets the same case register again under its own run', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);
      await seedExpectation(context, 'run-1', 'evidence-1', { passed: true, at: NOW.toISOString() });
      await registerPassed(context, 'e2e', ['evidence-1']);

      await expect(registerPassed(context, 'e2e', ['evidence-1'])).resolves.toBeDefined();
    });

    it('still lets a failed result through without any proof', async () => {
      const { context, fs } = createContext();
      await seedCase(fs);

      await expect(
        runRegisterCaseResult(context, {
          testCaseId: CASE_ID,
          testType: 'e2e',
          runId: 'run-1',
          status: 'failed',
          startedAt: STARTED_AT,
          evidenceIds: [],
          failure: { message: 'The dashboard never loaded' },
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('structured expectations (ADR-0016, #651)', () => {
    async function seedCaseWith(
      fs: FakeFileSystem,
      overrides: Readonly<Record<string, unknown>>,
    ): Promise<void> {
      await fs.mkdir(join('project', '.qa', 'artifacts', 'cases', 'login'));
      await fs.writeFile(
        join('project', '.qa', 'artifacts', 'cases', 'login', `${CASE_ID}.json`),
        JSON.stringify({
          schemaVersion: 1,
          id: CASE_ID,
          feature: 'login',
          requirementIds: ['login'],
          testType: 'e2e',
          title: 'A case',
          steps: [{ description: 'Step 1' }],
          expectedResult: 'It works',
          status: 'approved',
          createdAt: '2026-09-25T09:00:00.000Z',
          ...overrides,
        }),
      );
    }

    async function seedJson(
      context: EngineContext,
      id: string,
      record: Readonly<Record<string, unknown>>,
    ): Promise<void> {
      const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
      const manifest = new ManifestStore({ store, clock: context.clock });
      await new EvidenceStore({ store, manifest, clock: context.clock }).register({
        id,
        runId: 'run-1',
        kind: 'other',
        fileExtension: 'json',
        content: JSON.stringify(record),
      });
    }

    const httpRecord = (status: number, body = ''): Record<string, unknown> => ({
      type: 'http-request',
      stepId: 'step-1',
      method: 'GET',
      url: 'https://staging.example.test/missing',
      status,
      responseHeaders: {},
      bodyPreview: body,
      truncated: false,
      at: '2026-09-25T09:59:30.000Z',
    });

    function registerPassed(
      context: EngineContext,
      testType: 'e2e' | 'api',
      evidenceIds: readonly string[],
    ): Promise<unknown> {
      return runRegisterCaseResult(context, {
        testCaseId: CASE_ID,
        testType,
        runId: 'run-1',
        status: 'passed',
        startedAt: '2026-09-25T09:59:00.000Z',
        evidenceIds,
      });
    }

    it('accepts an api case that expects an error status once the engine saw that status', async () => {
      const { context, fs } = createContext();
      await seedCaseWith(fs, {
        testType: 'api',
        steps: [{ description: 'GET /missing', expectations: [{ kind: 'http-status', expected: 404 }] }],
      });
      await seedJson(context, 'evidence-1', httpRecord(404));

      await expect(registerPassed(context, 'api', ['evidence-1'])).resolves.toBeDefined();
    });

    it('accepts an api case whose result-level http-status matches the error response', async () => {
      const { context, fs } = createContext();
      await seedCaseWith(fs, {
        testType: 'api',
        steps: [{ description: 'GET /missing' }],
        resultExpectations: [{ kind: 'http-status', expected: 404 }],
      });
      await seedJson(context, 'evidence-1', httpRecord(404));

      await expect(registerPassed(context, 'api', ['evidence-1'])).resolves.toBeDefined();
    });

    it('refuses passed when a result-level http-status differs from the response', async () => {
      const { context, fs } = createContext();
      await seedCaseWith(fs, {
        testType: 'api',
        steps: [{ description: 'GET /missing' }],
        resultExpectations: [{ kind: 'http-status', expected: 404 }],
      });
      await seedJson(context, 'evidence-1', httpRecord(500));

      const error = await registerPassed(context, 'api', ['evidence-1']).catch((caught: unknown) => caught);

      expect((error as QaError).code).toBe('RUN_RESULT_STEP_NOT_PROVEN');
    });

    it('refuses passed when the response was not the declared one, listing the expectation', async () => {
      const { context, fs } = createContext();
      await seedCaseWith(fs, {
        testType: 'api',
        steps: [{ description: 'GET /missing', expectations: [{ kind: 'http-status', expected: 404 }] }],
      });
      await seedJson(context, 'evidence-1', httpRecord(200));

      const error = await registerPassed(context, 'api', ['evidence-1']).catch((caught: unknown) => caught);

      expect((error as QaError).code).toBe('RUN_RESULT_EXPECTATION_UNMET');
      expect((error as QaError).message).toContain('step 1: http-status = 404 (unmet)');
    });

    it('refuses passed while a declared check was never made, though another check passed', async () => {
      const { context, fs } = createContext();
      await seedCaseWith(fs, {
        steps: [{ description: 'Step 1', expectations: [{ kind: 'visible', selector: '#done' }] }],
      });
      await seedExpectation(context, 'run-1', 'evidence-1', {
        passed: true,
        at: NOW.toISOString(),
        selector: '#other',
      });

      const error = await registerPassed(context, 'e2e', ['evidence-1']).catch((caught: unknown) => caught);

      expect((error as QaError).code).toBe('RUN_RESULT_EXPECTATION_UNMET');
      expect((error as QaError).message).toContain('visible on "#done" (unobserved)');
    });

    it('accepts a web case whose declared step and result expectations were all met', async () => {
      const { context, fs } = createContext();
      await seedCaseWith(fs, {
        steps: [{ description: 'Step 1', expectations: [{ kind: 'visible', selector: '#done' }] }],
        resultExpectations: [{ kind: 'visible', selector: '#done' }],
      });
      await seedExpectation(context, 'run-1', 'evidence-1', {
        passed: true,
        at: NOW.toISOString(),
        selector: '#done',
      });

      await expect(registerPassed(context, 'e2e', ['evidence-1'])).resolves.toBeDefined();
    });

    it('does not ask for the generic check of a case that declares its own expectations', async () => {
      const { context, fs } = createContext();
      await seedCaseWith(fs, {
        testType: 'api',
        steps: [{ description: 'POST /orders' }],
        resultExpectations: [{ kind: 'http-body-contains', expected: 'created' }],
      });
      await seedJson(context, 'evidence-1', httpRecord(201, '{"status":"created"}'));

      await expect(registerPassed(context, 'api', ['evidence-1'])).resolves.toBeDefined();
    });

    it('still asks for proof of every step before judging the expectations', async () => {
      const { context, fs } = createContext();
      await seedCaseWith(fs, {
        steps: [
          { description: 'Step 1', expectations: [{ kind: 'visible', selector: '#done' }] },
          { description: 'Step 2' },
        ],
      });
      await seedExpectation(context, 'run-1', 'evidence-1', { passed: true, at: NOW.toISOString() });

      await expect(registerPassed(context, 'e2e', ['evidence-1'])).rejects.toMatchObject({
        code: 'RUN_RESULT_STEP_NOT_PROVEN',
      });
    });
  });
});
