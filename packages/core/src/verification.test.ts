// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { SCHEMA_VERSION, type Config, type GeneratedTestSpec, type RunResult } from '@qa-ai-stlc/schemas';
import { createFakeFileSystem, type FakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeProcessRunner, type ProcessResultLike } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import type { Runner, RunnerInput, RunnerOutcome } from './runner.js';
import { createFakeEngineContext } from './test-support/fake-engine-context.js';
import { createSequentialIdGenerator } from './test-support/fake-id-generator.js';
import {
  hasVerificationRetryBudget,
  registerVerifiedGeneratedTestSpec,
  verifyGeneratedTestSpec,
} from './verification.js';

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 2 }',
  '',
].join('\n');

const SPEC: GeneratedTestSpec = {
  schemaVersion: SCHEMA_VERSION,
  testCaseId: 'case-1',
  generatorVersion: '0.1.0',
  filePath: 'tests/qa/checkout/guest-checkout.spec.ts',
  sourceHash: 'a'.repeat(64),
  generatedAt: '2026-09-25T12:00:00Z',
  content: 'export const GENERATOR_VERSION = "0.1.0";',
};

const TARGET_ABSOLUTE_PATH = join('project', 'tests', 'qa', 'checkout', 'guest-checkout.spec.ts');

function createContext(
  overrides: { readonly processRunner?: ProcessResultLike; readonly fs?: FakeFileSystem } = {},
): { readonly context: EngineContext; readonly fs: FakeFileSystem } {
  const fs = overrides.fs ?? createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG_YAML });
  const context = createFakeEngineContext({
    fs,
    processRunner: createFakeProcessRunner(
      overrides.processRunner ?? { exitCode: 0, stdout: '', stderr: '' },
    ),
  });
  return { context, fs };
}

function fakeResult(overrides: Partial<RunResult> & Pick<RunResult, 'status'>): RunResult {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'result-1',
    runId: 'run-id',
    testCaseId: 'case-1',
    testType: 'e2e',
    startedAt: '2026-09-25T12:00:00Z',
    finishedAt: '2026-09-25T12:00:01Z',
    evidenceIds: [],
    ...overrides,
  };
}

function createFakeRunner(handler: (input: RunnerInput) => readonly RunnerOutcome[]): Runner {
  return {
    testType: 'e2e',
    run: (_engine, input) => Promise.resolve(handler(input)),
  };
}

const idGenerator = createSequentialIdGenerator('id');

describe('verifyGeneratedTestSpec', () => {
  it('rejects a typecheck failure without running the runner, and cleans up the scratch file', async () => {
    const { context, fs } = createContext({
      processRunner: {
        exitCode: 2,
        stdout: `${TARGET_ABSOLUTE_PATH.replace('project', 'scratch-dir')}(1,7): error TS2322: Type 'string' is not assignable to type 'number'.`,
        stderr: '',
      },
    });
    let runnerCalled = false;
    const runner = createFakeRunner(() => {
      runnerCalled = true;
      return [];
    });

    const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator });

    expect(outcome).toEqual({
      status: 'typecheck_failed',
      issues: [
        { path: [SPEC.filePath, 1, 7], message: "TS2322: Type 'string' is not assignable to type 'number'." },
      ],
    });
    expect(runnerCalled).toBe(false);
    await expect(fs.listFiles(join('project', 'tests', 'qa', 'checkout'))).resolves.toEqual([]);
  });

  it('ignores a line that looks like a diagnostic but has a non-numeric position', async () => {
    const { context } = createContext({
      processRunner: {
        exitCode: 2,
        stdout: [
          'file.ts(a,b): error TS0: not a real position',
          `${TARGET_ABSOLUTE_PATH}(3,1): error TS2304: Cannot find name 'x'.`,
        ].join('\n'),
        stderr: '',
      },
    });
    const runner = createFakeRunner(() => []);

    const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator });

    expect(outcome).toEqual({
      status: 'typecheck_failed',
      issues: [{ path: [SPEC.filePath, 3, 1], message: "TS2304: Cannot find name 'x'." }],
    });
  });

  it('falls back to raw stderr when tsc fails with no recognizable diagnostic', async () => {
    const { context } = createContext({
      processRunner: { exitCode: 1, stdout: '', stderr: 'internal compiler error' },
    });
    const runner = createFakeRunner(() => []);

    const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator });

    expect(outcome).toEqual({
      status: 'typecheck_failed',
      issues: [{ path: [SPEC.filePath], message: 'internal compiler error' }],
    });
  });

  it('falls back to a generic message when tsc fails with no stdout or stderr at all', async () => {
    const { context } = createContext({ processRunner: { exitCode: 1, stdout: '', stderr: '' } });
    const runner = createFakeRunner(() => []);

    const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator });

    expect(outcome).toEqual({
      status: 'typecheck_failed',
      issues: [{ path: [SPEC.filePath], message: 'tsc exited with a failure and produced no output.' }],
    });
  });

  it('resolves the configured environment and passes the scratch file to the runner', async () => {
    const { context } = createContext();
    let receivedInput: RunnerInput | undefined;
    const runner = createFakeRunner((input) => {
      receivedInput = input;
      return [{ result: fakeResult({ status: 'passed' }), evidence: [] }];
    });

    await verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator });

    expect(receivedInput?.baseUrl).toBe('https://staging.example.test/');
    expect(receivedInput?.specFiles).toHaveLength(1);
    expect(receivedInput?.specFiles[0]).not.toBe(TARGET_ABSOLUTE_PATH);
  });

  it('defaults to a random id generator when none is given', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [{ result: fakeResult({ status: 'passed' }), evidence: [] }]);

    const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, runner });

    expect(outcome.status).toBe('verified');
  });

  it('reports a passing execution as verified, and never writes the real target file', async () => {
    const { context, fs } = createContext();
    const runner = createFakeRunner(() => [{ result: fakeResult({ status: 'passed' }), evidence: [] }]);

    const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator });

    expect(outcome.status).toBe('verified');
    expect(await fs.pathExists(TARGET_ABSOLUTE_PATH)).toBe(false);
  });

  it('reports a failed execution with the failure message', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [
      {
        result: fakeResult({ status: 'failed', failure: { message: 'Expected 200, got 500' } }),
        evidence: [],
      },
    ]);

    const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator });

    expect(outcome).toEqual({
      status: 'execution_failed',
      issues: [{ path: [], message: 'Expected 200, got 500' }],
      result: expect.objectContaining({ status: 'failed' }) as RunResult,
    });
  });

  it('falls back to a generic message for a "failed" result with no recorded failure detail', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [
      { result: { ...fakeResult({ status: 'failed' }), failure: undefined }, evidence: [] },
    ]);

    const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator });

    expect(outcome).toMatchObject({
      status: 'execution_failed',
      issues: [{ message: 'The generated spec failed with no recorded failure detail.' }],
    });
  });

  it('names each missing step for a "partial" result', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [
      {
        result: fakeResult({ status: 'partial', missingStepIds: ['step-2', 'expected-result'] }),
        evidence: [],
      },
    ]);

    const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator });

    expect(outcome).toEqual({
      status: 'execution_failed',
      issues: [
        { path: ['step-2'], message: 'Step "step-2" did not run or did not complete.' },
        { path: ['expected-result'], message: 'Step "expected-result" did not run or did not complete.' },
      ],
      result: expect.objectContaining({ status: 'partial' }) as RunResult,
    });
  });

  it('falls back to no issues for a "partial" result with no recorded missing steps', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [
      { result: { ...fakeResult({ status: 'partial' }), missingStepIds: undefined }, evidence: [] },
    ]);

    const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator });

    expect(outcome).toEqual({
      status: 'verified',
      result: expect.objectContaining({ status: 'partial' }) as RunResult,
    });
  });

  it.each(['blocked', 'skipped', 'uncertain'] as const)(
    'reports a "%s" execution with a status-naming message',
    async (status) => {
      const { context } = createContext();
      const runner = createFakeRunner(() => [{ result: fakeResult({ status }), evidence: [] }]);

      const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator });

      expect(outcome).toEqual({
        status: 'execution_failed',
        issues: [{ path: [], message: `Execution reported status "${status}", not "passed".` }],
        result: expect.objectContaining({ status }) as RunResult,
      });
    },
  );

  it('throws for an unrecognized result status (schema drift), via assertNever', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [
      {
        result: { ...fakeResult({ status: 'passed' }), status: 'flaky' as unknown as RunResult['status'] },
        evidence: [],
      },
    ]);

    await expect(verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator })).rejects.toThrow(
      'Unhandled RunResult status: flaky',
    );
  });

  it('throws when the runner produces no result', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => []);

    await expect(verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator })).rejects.toThrow(
      QaError,
    );
  });

  it('throws when the runner produces more than one result', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [
      { result: fakeResult({ status: 'passed' }), evidence: [] },
      { result: fakeResult({ id: 'result-2', status: 'passed' }), evidence: [] },
    ]);

    await expect(verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator })).rejects.toThrow(
      'exactly one run result',
    );
  });

  it('throws when the result names a different test case than the spec', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [
      { result: fakeResult({ status: 'passed', testCaseId: 'a-different-case' }), evidence: [] },
    ]);

    await expect(verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator })).rejects.toThrow(
      /a-different-case/,
    );
  });

  it('always deletes the scratch file, even when the runner throws', async () => {
    const { context, fs } = createContext();
    const runner = createFakeRunner(() => {
      throw new Error('runner crashed');
    });

    await expect(verifyGeneratedTestSpec(context, { spec: SPEC, runner, idGenerator })).rejects.toThrow(
      'runner crashed',
    );
    expect(await fs.listFiles(join('project', 'tests', 'qa', 'checkout'))).toEqual([]);
  });
});

describe('registerVerifiedGeneratedTestSpec', () => {
  it('writes the spec content to its real path and registers it in the manifest', async () => {
    const { context, fs } = createContext();
    const verification = { status: 'verified' as const, result: fakeResult({ status: 'passed' }) };

    await registerVerifiedGeneratedTestSpec(context, SPEC, verification);

    expect(await fs.readFile(TARGET_ABSOLUTE_PATH)).toBe(SPEC.content);
    const manifest = JSON.parse(await fs.readFile(join('project', '.qa', 'manifest.json'))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts[SPEC.filePath]).toBeDefined();
  });

  it('throws when the verification result is for a different test case', async () => {
    const { context } = createContext();
    const verification = {
      status: 'verified' as const,
      result: fakeResult({ status: 'passed', testCaseId: 'a-different-case' }),
    };

    await expect(registerVerifiedGeneratedTestSpec(context, SPEC, verification)).rejects.toThrow(
      /a-different-case/,
    );
  });
});

describe('hasVerificationRetryBudget', () => {
  const config: Config = {
    schemaVersion: SCHEMA_VERSION,
    testing: { e2e: 'undecided', api: 'undecided', a11y: 'undecided', security: 'undecided' },
    environments: {},
    identities: {},
    data: { strategy: 'manual', ownerMarker: 'qa-ai-stlc' },
    selectors: { policy: 'playwright-default', testIdAttribute: 'data-testid' },
    agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 2 },
  };

  it('allows another attempt while attempts so far are within the budget', () => {
    expect(hasVerificationRetryBudget(config, 0)).toBe(true);
    expect(hasVerificationRetryBudget(config, 2)).toBe(true);
  });

  it('refuses another attempt once the budget is exhausted', () => {
    expect(hasVerificationRetryBudget(config, 3)).toBe(false);
  });
});
