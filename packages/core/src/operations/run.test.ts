// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { RunResult } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import type { Runner, RunnerInput, RunnerOutcome } from '../runner.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { createSequentialIdGenerator } from '../test-support/fake-id-generator.js';
import { runTestRun } from './run.js';
import { createFakeFileSystem, type FakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';

const NOW = new Date('2026-09-25T10:00:00.000Z');

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  '  prod: { baseUrl: "https://prod.example.test/", allowlist: ["prod.example.test"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

function createContext(): { readonly context: EngineContext; readonly fs: FakeFileSystem } {
  const fs = createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG_YAML });
  return { context: createFakeEngineContext({ fs, clock: { now: () => NOW } }), fs };
}

function fakeResult(overrides: Partial<RunResult> & Pick<RunResult, 'id' | 'status'>): RunResult {
  return {
    schemaVersion: 1,
    runId: 'run-id-1',
    testCaseId: 'case-1',
    testType: 'e2e',
    startedAt: '2026-09-25T09:59:00.000Z',
    finishedAt: '2026-09-25T09:59:05.000Z',
    evidenceIds: [],
    ...overrides,
  };
}

/** Pairs a `fakeResult()` with no captured evidence — the common case for a passing/skipped test. */
function fakeOutcome(result: RunResult): RunnerOutcome {
  return { result, evidence: [] };
}

interface FakeRunner {
  readonly runner: Runner;
  readonly state: { receivedInput: RunnerInput | undefined };
}

function createFakeRunner(handler: (input: RunnerInput) => readonly RunnerOutcome[]): FakeRunner {
  const state: { receivedInput: RunnerInput | undefined } = { receivedInput: undefined };
  const runner: Runner = {
    testType: 'e2e',
    run: (_engine, input) => {
      state.receivedInput = input;
      return Promise.resolve(handler(input));
    },
  };
  return { runner, state };
}

describe('runTestRun', () => {
  it('runs a spec set and persists a run record with every result', async () => {
    const { context, fs } = createContext();
    const { runner } = createFakeRunner(() => [
      fakeOutcome(fakeResult({ id: 'run-result-id-2', status: 'passed' })),
      {
        result: fakeResult({ id: 'run-result-id-3', status: 'failed', failure: { message: 'boom' } }),
        evidence: [{ kind: 'screenshot', content: new Uint8Array([1, 2, 3]) }],
      },
    ]);

    const summary = await runTestRun(context, {
      runner,
      environment: 'staging',
      specFiles: ['tests/login.playwright-spec.ts'],
      idGenerator: createSequentialIdGenerator('id'),
    });

    expect(summary).toEqual({
      runId: 'run-id-1',
      runRecordPath: 'runs/run-id-1/run.json',
      resultPaths: [
        'runs/run-id-1/results/run-result-id-2.json',
        'runs/run-id-1/results/run-result-id-3.json',
      ],
      counts: { passed: 1, failed: 1, blocked: 0, skipped: 0, uncertain: 0, partial: 0 },
    });

    const runRecord = JSON.parse(
      String(fs.getRawFile(join('project', '.qa', 'runs', 'run-id-1', 'run.json'))),
    ) as { specFiles: string[]; baseUrl: string; resultIds: string[] };
    expect(runRecord).toMatchObject({
      id: 'run-id-1',
      testType: 'e2e',
      specFiles: ['tests/login.playwright-spec.ts'],
      baseUrl: 'https://staging.example.test/',
      resultIds: ['run-result-id-2', 'run-result-id-3'],
    });

    const persistedResult = JSON.parse(
      String(fs.getRawFile(join('project', '.qa', 'runs', 'run-id-1', 'results', 'run-result-id-2.json'))),
    ) as RunResult;
    expect(persistedResult.status).toBe('passed');
  });

  it('registers the run record and every result in the manifest', async () => {
    const { context, fs } = createContext();
    const { runner } = createFakeRunner(() => [
      fakeOutcome(fakeResult({ id: 'run-result-id-2', status: 'passed' })),
    ]);

    const summary = await runTestRun(context, {
      runner,
      environment: 'staging',
      specFiles: ['tests/login.playwright-spec.ts'],
      idGenerator: createSequentialIdGenerator('id'),
    });

    const manifest = JSON.parse(String(fs.getRawFile(join('project', '.qa', 'manifest.json')))) as {
      artifacts: Record<string, unknown>;
    };
    expect(manifest.artifacts).toHaveProperty(summary.runRecordPath);
    expect(manifest.artifacts).toHaveProperty(summary.resultPaths[0]!);
  });

  it('resolves the baseUrl from the named environment and passes an absolute spec path to the runner', async () => {
    const { context } = createContext();
    const { runner, state } = createFakeRunner(() => []);

    await runTestRun(context, {
      runner,
      environment: 'prod',
      specFiles: ['tests/login.playwright-spec.ts'],
      idGenerator: createSequentialIdGenerator('id'),
    });

    expect(state.receivedInput).toMatchObject({
      runId: 'run-id-1',
      baseUrl: 'https://prod.example.test/',
      specFiles: [join('project', 'tests', 'login.playwright-spec.ts')],
    });
  });

  it('generates a random run ID when no idGenerator is given', async () => {
    const { context } = createContext();
    const { runner, state } = createFakeRunner(() => []);

    const summary = await runTestRun(context, {
      runner,
      environment: 'staging',
      specFiles: ['tests/login.playwright-spec.ts'],
    });

    expect(summary.runId).toMatch(/^run-[0-9a-f-]{36}$/);
    expect(state.receivedInput?.runId).toBe(summary.runId);
  });

  it('throws for a spec file outside the project', async () => {
    const { context } = createContext();
    const { runner } = createFakeRunner(() => []);

    await expect(runTestRun(context, { runner, specFiles: ['../outside.spec.ts'] })).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_RELATIVE_PATH' }) as Error,
    );
  });

  it('throws when the environment cannot be resolved', async () => {
    const fs = createFakeFileSystem({
      [join('project', '.qa', 'config.yaml')]: CONFIG_YAML,
    });
    const context = createFakeEngineContext({ fs, clock: { now: () => NOW } });
    const { runner } = createFakeRunner(() => []);

    await expect(
      runTestRun(context, {
        runner,
        environment: 'unknown-env',
        specFiles: ['tests/login.playwright-spec.ts'],
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'BROWSER_ENVIRONMENT_UNKNOWN' }) as Error);
  });

  it('produces an empty run record when the runner reports no results', async () => {
    const { context, fs } = createContext();
    const { runner } = createFakeRunner(() => []);

    const summary = await runTestRun(context, {
      runner,
      environment: 'staging',
      specFiles: ['tests/login.playwright-spec.ts'],
      idGenerator: createSequentialIdGenerator('id'),
    });

    expect(summary.resultPaths).toEqual([]);
    expect(summary.counts).toEqual({
      passed: 0,
      failed: 0,
      blocked: 0,
      skipped: 0,
      uncertain: 0,
      partial: 0,
    });
    const runRecord = JSON.parse(String(fs.getRawFile(join('project', '.qa', summary.runRecordPath)))) as {
      resultIds: string[];
    };
    expect(runRecord.resultIds).toEqual([]);
  });

  it('registers a runner-captured screenshot as evidence and fills in the result’s evidenceIds', async () => {
    const { context, fs } = createContext();
    const { runner } = createFakeRunner(() => [
      {
        result: fakeResult({ id: 'run-result-id-2', status: 'failed', failure: { message: 'boom' } }),
        evidence: [{ kind: 'screenshot', content: new Uint8Array([1, 2, 3]) }],
      },
    ]);

    await runTestRun(context, {
      runner,
      environment: 'staging',
      specFiles: ['tests/login.playwright-spec.ts'],
      idGenerator: createSequentialIdGenerator('id'),
    });

    const persistedResult = JSON.parse(
      String(fs.getRawFile(join('project', '.qa', 'runs', 'run-id-1', 'results', 'run-result-id-2.json'))),
    ) as RunResult;
    expect(persistedResult.evidenceIds).toEqual(['evidence-id-2']);
    expect(fs.getRawFile(join('project', '.qa', 'evidence', 'run-id-1', 'evidence-id-2.png'))).toBeDefined();
  });

  it('throws when a failed result has no registered evidence', async () => {
    const { context } = createContext();
    const { runner } = createFakeRunner(() => [
      fakeOutcome(fakeResult({ id: 'run-result-id-2', status: 'failed', failure: { message: 'boom' } })),
    ]);

    await expect(
      runTestRun(context, {
        runner,
        environment: 'staging',
        specFiles: ['tests/login.playwright-spec.ts'],
        idGenerator: createSequentialIdGenerator('id'),
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'RUN_RESULT_MISSING_EVIDENCE' }) as Error);
  });

  it('throws when a failed result’s only evidence is quarantined for a leaked secret', async () => {
    const { context } = createContext();
    const { runner } = createFakeRunner(() => [
      {
        result: fakeResult({ id: 'run-result-id-2', status: 'failed', failure: { message: 'boom' } }),
        evidence: [
          { kind: 'console-log', content: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345' },
        ],
      },
    ]);

    await expect(
      runTestRun(context, {
        runner,
        environment: 'staging',
        specFiles: ['tests/login.playwright-spec.ts'],
        idGenerator: createSequentialIdGenerator('id'),
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'RUN_RESULT_MISSING_EVIDENCE' }) as Error);
  });

  it('registers a runner-captured evidence item that names a step, same as one that does not', async () => {
    const { context, fs } = createContext();
    const { runner } = createFakeRunner(() => [
      {
        result: fakeResult({ id: 'run-result-id-2', status: 'failed', failure: { message: 'boom' } }),
        evidence: [{ kind: 'screenshot', content: new Uint8Array([1, 2, 3]), stepId: 'step-1' }],
      },
    ]);

    await runTestRun(context, {
      runner,
      environment: 'staging',
      specFiles: ['tests/login.playwright-spec.ts'],
      idGenerator: createSequentialIdGenerator('id'),
    });

    const persistedResult = JSON.parse(
      String(fs.getRawFile(join('project', '.qa', 'runs', 'run-id-1', 'results', 'run-result-id-2.json'))),
    ) as RunResult;
    expect(persistedResult.evidenceIds).toEqual(['evidence-id-2']);
  });

  it('registers a passing result’s evidence without requiring any (only failed results are checked)', async () => {
    const { context, fs } = createContext();
    const { runner } = createFakeRunner(() => [
      fakeOutcome(fakeResult({ id: 'run-result-id-2', status: 'passed' })),
    ]);

    await runTestRun(context, {
      runner,
      environment: 'staging',
      specFiles: ['tests/login.playwright-spec.ts'],
      idGenerator: createSequentialIdGenerator('id'),
    });

    const persistedResult = JSON.parse(
      String(fs.getRawFile(join('project', '.qa', 'runs', 'run-id-1', 'results', 'run-result-id-2.json'))),
    ) as RunResult;
    expect(persistedResult.evidenceIds).toEqual([]);
  });
});
