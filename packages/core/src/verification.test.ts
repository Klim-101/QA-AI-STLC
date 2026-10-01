// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import {
  ConfigSchema,
  SCHEMA_VERSION,
  TestCaseSchema,
  VerificationRecordSchema,
  type Config,
  type GeneratedTestSpec,
  type RunResult,
  type TestCase,
} from '@qa-ai-stlc/schemas';
import { createFakeFileSystem, type FakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeProcessRunner, type ProcessResultLike } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import { hashText } from './hash.js';
import { toCanonicalJson } from './json-file.js';
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

const TEST_CASE: TestCase = {
  schemaVersion: SCHEMA_VERSION,
  id: 'case-1',
  feature: 'checkout',
  requirementIds: ['req-1'],
  testType: 'e2e',
  title: 'A guest can check out',
  steps: [{ description: 'Add an item to the cart' }, { description: 'Complete checkout as a guest' }],
  expectedResult: 'The order confirmation page is shown',
  status: 'approved',
  createdAt: '2026-09-25T09:00:00Z',
};

const TARGET_ABSOLUTE_PATH = join('project', 'tests', 'qa', 'checkout', 'guest-checkout.spec.ts');

const CASE_ABSOLUTE_PATH = join('project', '.qa', 'artifacts', 'cases', 'checkout', 'case-1.json');
const MANIFEST_ABSOLUTE_PATH = join('project', '.qa', 'manifest.json');

// The case file and a manifest that registers it, built synchronously so every test starts from a
// project where "case-1" is a real, untampered registered case.
function registeredCaseFiles(testCase: TestCase = TEST_CASE): Record<string, string> {
  const caseJson = toCanonicalJson(TestCaseSchema.parse(testCase));
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    artifacts: {
      'artifacts/cases/checkout/case-1.json': {
        sha256: hashText(caseJson),
        mode: 'text',
        registeredAt: '2026-09-25T09:00:00.000Z',
      },
    },
  };
  return { [CASE_ABSOLUTE_PATH]: caseJson, [MANIFEST_ABSOLUTE_PATH]: toCanonicalJson(manifest) };
}

function createContext(
  overrides: { readonly processRunner?: ProcessResultLike; readonly fs?: FakeFileSystem } = {},
): { readonly context: EngineContext; readonly fs: FakeFileSystem } {
  const fs =
    overrides.fs ??
    createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG_YAML, ...registeredCaseFiles() });
  const context = createFakeEngineContext({
    fs,
    processRunner: createFakeProcessRunner(
      overrides.processRunner ?? { exitCode: 0, stdout: '', stderr: '' },
    ),
  });
  return { context, fs };
}

async function readRecord(fs: FakeFileSystem, verificationId: string): Promise<unknown> {
  return VerificationRecordSchema.parse(
    JSON.parse(await fs.readFile(join('project', '.qa', 'verifications', `${verificationId}.json`))),
  );
}

async function manifestEntryFor(fs: FakeFileSystem, relativePath: string): Promise<unknown> {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_ABSOLUTE_PATH)) as {
    artifacts: Record<string, unknown>;
  };
  return manifest.artifacts[relativePath];
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
    ...(overrides.status === 'failed' ? { failure: { message: 'Assertion failed' } } : {}),
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

    const outcome = await verifyGeneratedTestSpec(context, {
      spec: SPEC,
      testCase: TEST_CASE,
      runner,
      idGenerator,
    });

    expect(outcome).toEqual({
      verificationId: expect.stringMatching(/^verification-/) as string,
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

    const outcome = await verifyGeneratedTestSpec(context, {
      spec: SPEC,
      testCase: TEST_CASE,
      runner,
      idGenerator,
    });

    expect(outcome).toEqual({
      verificationId: expect.stringMatching(/^verification-/) as string,
      status: 'typecheck_failed',
      issues: [{ path: [SPEC.filePath, 3, 1], message: "TS2304: Cannot find name 'x'." }],
    });
  });

  it('falls back to raw stderr when tsc fails with no recognizable diagnostic', async () => {
    const { context } = createContext({
      processRunner: { exitCode: 1, stdout: '', stderr: 'internal compiler error' },
    });
    const runner = createFakeRunner(() => []);

    const outcome = await verifyGeneratedTestSpec(context, {
      spec: SPEC,
      testCase: TEST_CASE,
      runner,
      idGenerator,
    });

    expect(outcome).toEqual({
      verificationId: expect.stringMatching(/^verification-/) as string,
      status: 'typecheck_failed',
      issues: [{ path: [SPEC.filePath], message: 'internal compiler error' }],
    });
  });

  it('falls back to a generic message when tsc fails with no stdout or stderr at all', async () => {
    const { context } = createContext({ processRunner: { exitCode: 1, stdout: '', stderr: '' } });
    const runner = createFakeRunner(() => []);

    const outcome = await verifyGeneratedTestSpec(context, {
      spec: SPEC,
      testCase: TEST_CASE,
      runner,
      idGenerator,
    });

    expect(outcome).toEqual({
      verificationId: expect.stringMatching(/^verification-/) as string,
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

    await verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner, idGenerator });

    expect(receivedInput?.baseUrl).toBe('https://staging.example.test/');
    expect(receivedInput?.specFiles).toHaveLength(1);
    expect(receivedInput?.specFiles[0]).not.toBe(TARGET_ABSOLUTE_PATH);
  });

  // P3-20: coverage must be checked against the case the engine itself registered, not whatever
  // the spec's own "stepIds" annotation claims to cover.
  it('passes the canonical step ids derived from testCase, not the spec, to the runner', async () => {
    const { context } = createContext();
    let receivedInput: RunnerInput | undefined;
    const runner = createFakeRunner((input) => {
      receivedInput = input;
      return [{ result: fakeResult({ status: 'passed' }), evidence: [] }];
    });

    await verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner, idGenerator });

    expect(receivedInput?.requiredStepIds).toEqual(['step-1', 'step-2', 'expected-result']);
  });

  it('passes the runner the environment name, for runners that read project configuration', async () => {
    const { context } = createContext();
    let receivedInput: RunnerInput | undefined;
    const runner = createFakeRunner((input) => {
      receivedInput = input;
      return [{ result: fakeResult({ status: 'passed' }), evidence: [] }];
    });

    await verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner, idGenerator });

    expect(receivedInput?.environment).toBe('staging');
  });

  describe('api auth helper (P6-35)', () => {
    const helperPath = join('project', 'tests', 'qa', 'api-auth.ts');

    it('writes the helper before typechecking an api spec, so the spec can import it', async () => {
      const apiCase: TestCase = { ...TEST_CASE, testType: 'api' };
      const { context, fs } = createContext({
        fs: createFakeFileSystem({
          [join('project', '.qa', 'config.yaml')]: CONFIG_YAML,
          ...registeredCaseFiles(apiCase),
        }),
      });
      const order: string[] = [];
      const runner = createFakeRunner(() => [{ result: fakeResult({ status: 'passed' }), evidence: [] }]);
      const originalRun = context.processRunner.run.bind(context.processRunner);
      context.processRunner.run = async (...args) => {
        order.push(`tsc:${String(await fs.pathExists(helperPath))}`);
        return originalRun(...args);
      };

      await verifyGeneratedTestSpec(context, {
        spec: SPEC,
        testCase: apiCase,
        runner,
        idGenerator,
      });

      expect(order[0]).toBe('tsc:true');
    });

    it('leaves an e2e verification without an api auth helper', async () => {
      const { context, fs } = createContext();
      const runner = createFakeRunner(() => [{ result: fakeResult({ status: 'passed' }), evidence: [] }]);

      await verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner, idGenerator });

      expect(await fs.pathExists(helperPath)).toBe(false);
    });
  });

  describe('contract stamp (P6-13)', () => {
    const CONTRACT_SHA256 = 'e'.repeat(64);

    it('verifies a spec that declares the contract hash it was generated against', async () => {
      const { context } = createContext();
      const runner = createFakeRunner(() => [{ result: fakeResult({ status: 'passed' }), evidence: [] }]);
      const spec = { ...SPEC, content: `export const CONTRACT_SHA256 = "${CONTRACT_SHA256}";` };

      const outcome = await verifyGeneratedTestSpec(context, {
        spec,
        testCase: TEST_CASE,
        runner,
        idGenerator,
        contractSha256: CONTRACT_SHA256,
      });

      expect(outcome.status).toBe('verified');
    });

    it.each([
      ['declares none', 'export const GENERATOR_VERSION = "0.1.0";'],
      ['declares a different hash', `export const CONTRACT_SHA256 = "${'f'.repeat(64)}";`],
    ])('rejects a spec that %s, before anything runs or is written', async (_label, content) => {
      const { context, fs } = createContext();
      let runnerCalled = false;
      const runner = createFakeRunner(() => {
        runnerCalled = true;
        return [];
      });

      const rejected = await verifyGeneratedTestSpec(context, {
        spec: { ...SPEC, content },
        testCase: TEST_CASE,
        runner,
        idGenerator,
        contractSha256: CONTRACT_SHA256,
      }).catch((caught: unknown) => caught);

      expect(rejected).toMatchObject({ code: 'core.verification.contract_stamp_mismatch' });
      expect(runnerCalled).toBe(false);
      expect(await fs.pathExists(join('project', '.qa', 'verifications'))).toBe(false);
    });
  });

  it('throws when testCase does not match the spec it is verifying', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [{ result: fakeResult({ status: 'passed' }), evidence: [] }]);

    await expect(
      verifyGeneratedTestSpec(context, {
        spec: SPEC,
        testCase: { ...TEST_CASE, id: 'a-different-case' },
        runner,
        idGenerator,
      }),
    ).rejects.toMatchObject({ code: 'core.verification.test_case_mismatch' });
  });

  it('defaults to a random id generator when none is given', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [{ result: fakeResult({ status: 'passed' }), evidence: [] }]);

    const outcome = await verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner });

    expect(outcome.status).toBe('verified');
  });

  it('reports a passing execution as verified, and never writes the real target file', async () => {
    const { context, fs } = createContext();
    const runner = createFakeRunner(() => [{ result: fakeResult({ status: 'passed' }), evidence: [] }]);

    const outcome = await verifyGeneratedTestSpec(context, {
      spec: SPEC,
      testCase: TEST_CASE,
      runner,
      idGenerator,
    });

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

    const outcome = await verifyGeneratedTestSpec(context, {
      spec: SPEC,
      testCase: TEST_CASE,
      runner,
      idGenerator,
    });

    expect(outcome).toEqual({
      verificationId: expect.stringMatching(/^verification-/) as string,
      status: 'execution_failed',
      issues: [{ path: [], message: 'Expected 200, got 500' }],
      result: expect.objectContaining({ status: 'failed' }) as RunResult,
    });
  });

  // Both fallbacks below exist only for a result the run result schema forbids; the verification
  // record refuses to store one, so neither can end in a "verified" record.
  it('rejects a "failed" result with no recorded failure detail', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [
      { result: { ...fakeResult({ status: 'failed' }), failure: undefined }, evidence: [] },
    ]);

    await expect(
      verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner, idGenerator }),
    ).rejects.toThrow('is required when status is');
  });

  it('names each missing step for a "partial" result', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [
      {
        result: fakeResult({ status: 'partial', missingStepIds: ['step-2', 'expected-result'] }),
        evidence: [],
      },
    ]);

    const outcome = await verifyGeneratedTestSpec(context, {
      spec: SPEC,
      testCase: TEST_CASE,
      runner,
      idGenerator,
    });

    expect(outcome).toEqual({
      verificationId: expect.stringMatching(/^verification-/) as string,
      status: 'execution_failed',
      issues: [
        { path: ['step-2'], message: 'Step "step-2" did not run or did not complete.' },
        { path: ['expected-result'], message: 'Step "expected-result" did not run or did not complete.' },
      ],
      result: expect.objectContaining({ status: 'partial' }) as RunResult,
    });
  });

  it('rejects a "partial" result with no recorded missing steps instead of verifying it', async () => {
    const { context, fs } = createContext();
    const runner = createFakeRunner(() => [
      { result: { ...fakeResult({ status: 'partial' }), missingStepIds: undefined }, evidence: [] },
    ]);

    await expect(
      verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner, idGenerator }),
    ).rejects.toThrow();
    expect(await fs.listFiles(join('project', '.qa', 'verifications'))).toEqual([]);
  });

  it.each(['blocked', 'skipped', 'uncertain'] as const)(
    'reports a "%s" execution with a status-naming message',
    async (status) => {
      const { context } = createContext();
      const runner = createFakeRunner(() => [{ result: fakeResult({ status }), evidence: [] }]);

      const outcome = await verifyGeneratedTestSpec(context, {
        spec: SPEC,
        testCase: TEST_CASE,
        runner,
        idGenerator,
      });

      expect(outcome).toEqual({
        verificationId: expect.stringMatching(/^verification-/) as string,
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

    await expect(
      verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner, idGenerator }),
    ).rejects.toThrow('Unhandled RunResult status: flaky');
  });

  it('throws when the runner produces no result', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => []);

    await expect(
      verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner, idGenerator }),
    ).rejects.toThrow(QaError);
  });

  it('throws when the runner produces more than one result', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [
      { result: fakeResult({ status: 'passed' }), evidence: [] },
      { result: fakeResult({ id: 'result-2', status: 'passed' }), evidence: [] },
    ]);

    await expect(
      verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner, idGenerator }),
    ).rejects.toThrow('exactly one run result');
  });

  it('throws when the result names a different test case than the spec', async () => {
    const { context } = createContext();
    const runner = createFakeRunner(() => [
      { result: fakeResult({ status: 'passed', testCaseId: 'a-different-case' }), evidence: [] },
    ]);

    await expect(
      verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner, idGenerator }),
    ).rejects.toThrow(/a-different-case/);
  });

  it('always deletes the scratch file, even when the runner throws', async () => {
    const { context, fs } = createContext();
    const runner = createFakeRunner(() => {
      throw new Error('runner crashed');
    });

    await expect(
      verifyGeneratedTestSpec(context, { spec: SPEC, testCase: TEST_CASE, runner, idGenerator }),
    ).rejects.toThrow('runner crashed');
    expect(await fs.listFiles(join('project', 'tests', 'qa', 'checkout'))).toEqual([]);
  });
});

describe('verifyGeneratedTestSpec verification records', () => {
  it('records a typecheck failure as a registered record with no run result', async () => {
    const { context, fs } = createContext({ processRunner: { exitCode: 1, stdout: '', stderr: 'boom' } });

    const outcome = await verifyGeneratedTestSpec(context, {
      spec: SPEC,
      testCase: TEST_CASE,
      runner: createFakeRunner(() => []),
      idGenerator: createSequentialIdGenerator('t'),
    });

    expect(outcome.verificationId).toBe('verification-t-1');
    expect(await readRecord(fs, outcome.verificationId)).toEqual({
      schemaVersion: SCHEMA_VERSION,
      id: 'verification-t-1',
      testCaseId: SPEC.testCaseId,
      filePath: SPEC.filePath,
      contentSha256: hashText(SPEC.content),
      status: 'typecheck_failed',
      verifiedAt: expect.any(String) as string,
    });
    expect(await manifestEntryFor(fs, 'verifications/verification-t-1.json')).toBeDefined();
  });

  it.each([
    ['passed', 'verified'],
    ['failed', 'execution_failed'],
  ] as const)(
    'records a "%s" execution as a "%s" record carrying the run result',
    async (runStatus, status) => {
      const { context, fs } = createContext();
      const runner = createFakeRunner(() => [{ result: fakeResult({ status: runStatus }), evidence: [] }]);

      const outcome = await verifyGeneratedTestSpec(context, {
        spec: SPEC,
        testCase: TEST_CASE,
        runner,
        idGenerator,
      });

      expect(outcome.status).toBe(status);
      expect(await readRecord(fs, outcome.verificationId)).toMatchObject({
        status,
        result: { status: runStatus },
      });
    },
  );

  it('rejects a test case that is not registered, before writing anything', async () => {
    const { context, fs } = createContext();
    const unknownCase = { ...TEST_CASE, id: 'never-registered' };

    await expect(
      verifyGeneratedTestSpec(context, {
        spec: { ...SPEC, testCaseId: 'never-registered' },
        testCase: unknownCase,
        runner: createFakeRunner(() => []),
        idGenerator,
      }),
    ).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
    expect(await fs.listFiles(join('project', '.qa', 'verifications'))).toEqual([]);
  });

  it('rejects a registered case whose file was edited outside the engine', async () => {
    const edited = toCanonicalJson(TestCaseSchema.parse({ ...TEST_CASE, steps: [TEST_CASE.steps[0]] }));
    const fs = createFakeFileSystem({
      [join('project', '.qa', 'config.yaml')]: CONFIG_YAML,
      ...registeredCaseFiles(),
      [CASE_ABSOLUTE_PATH]: edited,
    });
    const { context } = createContext({ fs });

    await expect(
      verifyGeneratedTestSpec(context, {
        spec: SPEC,
        testCase: TEST_CASE,
        runner: createFakeRunner(() => []),
        idGenerator,
      }),
    ).rejects.toMatchObject({ code: 'ARTIFACT_HASH_MISMATCH' });
  });

  // P3-20: a caller-supplied copy with fewer steps would otherwise shrink the required coverage.
  it('rejects a testCase that differs from the registered case', async () => {
    const { context } = createContext();
    let runnerCalled = false;
    const runner = createFakeRunner(() => {
      runnerCalled = true;
      return [];
    });

    await expect(
      verifyGeneratedTestSpec(context, {
        spec: SPEC,
        testCase: { ...TEST_CASE, steps: [{ description: 'Add an item to the cart' }] },
        runner,
        idGenerator,
      }),
    ).rejects.toMatchObject({ code: 'core.verification.test_case_changed' });
    expect(runnerCalled).toBe(false);
  });
});

async function verifyPassing(context: EngineContext, spec: GeneratedTestSpec = SPEC): Promise<string> {
  const runner = createFakeRunner(() => [{ result: fakeResult({ status: 'passed' }), evidence: [] }]);
  const outcome = await verifyGeneratedTestSpec(context, { spec, testCase: TEST_CASE, runner, idGenerator });
  expect(outcome.status).toBe('verified');
  return outcome.verificationId;
}

describe('registerVerifiedGeneratedTestSpec', () => {
  it('writes the verified spec to its real path, registers it and consumes the record', async () => {
    const { context, fs } = createContext();
    const verificationId = await verifyPassing(context);

    await registerVerifiedGeneratedTestSpec(context, SPEC, verificationId);

    expect(await fs.readFile(TARGET_ABSOLUTE_PATH)).toBe(SPEC.content);
    expect(await manifestEntryFor(fs, SPEC.filePath)).toBeDefined();
    expect(await readRecord(fs, verificationId)).toMatchObject({ consumedAt: expect.any(String) as string });
  });

  // The live repro from P4-13: nothing was ever verified, the caller just names an outcome.
  it.each(['verification-made-up', 'not-a-verification-id', 'verification-a/../../manifest'])(
    'rejects "%s", for which the engine holds no record, without writing the spec',
    async (verificationId) => {
      const { context, fs } = createContext();

      await expect(registerVerifiedGeneratedTestSpec(context, SPEC, verificationId)).rejects.toMatchObject({
        code: 'core.verification.record_not_found',
      });
      expect(await fs.pathExists(TARGET_ABSOLUTE_PATH)).toBe(false);
    },
  );

  it('rejects a record written outside the engine', async () => {
    const { context, fs } = createContext();
    const forged = {
      schemaVersion: SCHEMA_VERSION,
      id: 'verification-forged',
      testCaseId: SPEC.testCaseId,
      filePath: SPEC.filePath,
      contentSha256: hashText(SPEC.content),
      status: 'verified',
      result: fakeResult({ status: 'passed' }),
      verifiedAt: '2026-09-28T12:00:00Z',
    };
    await fs.writeFile(
      join('project', '.qa', 'verifications', 'verification-forged.json'),
      toCanonicalJson(forged),
    );

    await expect(
      registerVerifiedGeneratedTestSpec(context, SPEC, 'verification-forged'),
    ).rejects.toMatchObject({
      code: 'ARTIFACT_UNREGISTERED',
    });
    expect(await fs.pathExists(TARGET_ABSOLUTE_PATH)).toBe(false);
  });

  it('rejects a registered record edited to read "verified"', async () => {
    const { context, fs } = createContext({ processRunner: { exitCode: 1, stdout: '', stderr: 'boom' } });
    const outcome = await verifyGeneratedTestSpec(context, {
      spec: SPEC,
      testCase: TEST_CASE,
      runner: createFakeRunner(() => []),
      idGenerator,
    });
    const recordPath = join('project', '.qa', 'verifications', `${outcome.verificationId}.json`);
    const record = JSON.parse(await fs.readFile(recordPath)) as Record<string, unknown>;
    await fs.writeFile(recordPath, toCanonicalJson({ ...record, status: 'verified' }));

    await expect(
      registerVerifiedGeneratedTestSpec(context, SPEC, outcome.verificationId),
    ).rejects.toMatchObject({ code: 'ARTIFACT_HASH_MISMATCH' });
  });

  it.each([
    ['typecheck_failed', { exitCode: 1, stdout: '', stderr: 'boom' }, 'passed'],
    ['execution_failed', { exitCode: 0, stdout: '', stderr: '' }, 'failed'],
  ] as const)('rejects a "%s" record', async (_status, processRunner, runStatus) => {
    const { context, fs } = createContext({ processRunner });
    const runner = createFakeRunner(() => [{ result: fakeResult({ status: runStatus }), evidence: [] }]);
    const outcome = await verifyGeneratedTestSpec(context, {
      spec: SPEC,
      testCase: TEST_CASE,
      runner,
      idGenerator,
    });

    await expect(
      registerVerifiedGeneratedTestSpec(context, SPEC, outcome.verificationId),
    ).rejects.toMatchObject({ code: 'core.verification.not_verified' });
    expect(await fs.pathExists(TARGET_ABSOLUTE_PATH)).toBe(false);
  });

  it('rejects reusing a record that already authorized a registration', async () => {
    const { context } = createContext();
    const verificationId = await verifyPassing(context);
    await registerVerifiedGeneratedTestSpec(context, SPEC, verificationId);

    await expect(registerVerifiedGeneratedTestSpec(context, SPEC, verificationId)).rejects.toMatchObject({
      code: 'core.verification.already_consumed',
    });
  });

  it('rejects a record for a different file path', async () => {
    const { context, fs } = createContext();
    const verificationId = await verifyPassing(context);
    const moved = { ...SPEC, filePath: 'tests/qa/checkout/elsewhere.spec.ts' };

    await expect(registerVerifiedGeneratedTestSpec(context, moved, verificationId)).rejects.toMatchObject({
      code: 'core.verification.spec_mismatch',
    });
    expect(await fs.pathExists(join('project', 'tests', 'qa', 'checkout', 'elsewhere.spec.ts'))).toBe(false);
  });

  it('rejects a record for a different test case', async () => {
    const { context } = createContext();
    const verificationId = await verifyPassing(context);

    await expect(
      registerVerifiedGeneratedTestSpec(context, { ...SPEC, testCaseId: 'case-2' }, verificationId),
    ).rejects.toMatchObject({ code: 'core.verification.spec_mismatch' });
  });

  // P3-18: verifying one content must not authorize registering a different one.
  it('rejects content changed after verification', async () => {
    const { context, fs } = createContext();
    const verificationId = await verifyPassing(context);
    const changed = { ...SPEC, content: 'this is not TypeScript at all {{{ ;;;' };

    await expect(registerVerifiedGeneratedTestSpec(context, changed, verificationId)).rejects.toMatchObject({
      code: 'core.verification.content_mismatch',
    });
    expect(await fs.pathExists(TARGET_ABSOLUTE_PATH)).toBe(false);
    expect(await readRecord(fs, verificationId)).not.toHaveProperty('consumedAt');
  });

  it('rejects a record whose test case was removed after verification', async () => {
    const { context, fs } = createContext();
    const verificationId = await verifyPassing(context);
    await fs.deleteFile(CASE_ABSOLUTE_PATH);

    await expect(registerVerifiedGeneratedTestSpec(context, SPEC, verificationId)).rejects.toMatchObject({
      code: 'CASE_NOT_FOUND',
    });
  });
});

describe('hasVerificationRetryBudget', () => {
  const config: Config = ConfigSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    testing: { e2e: 'undecided', api: 'undecided', a11y: 'undecided', security: 'undecided' },
    environments: {},
    identities: {},
    data: { strategy: 'manual', ownerMarker: 'qa-ai-stlc' },
    selectors: { policy: 'playwright-default', testIdAttribute: 'data-testid' },
    agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 2 },
  });

  it('allows another attempt while attempts so far are within the budget', () => {
    expect(hasVerificationRetryBudget(config, 0)).toBe(true);
    expect(hasVerificationRetryBudget(config, 2)).toBe(true);
  });

  it('refuses another attempt once the budget is exhausted', () => {
    expect(hasVerificationRetryBudget(config, 3)).toBe(false);
  });
});
