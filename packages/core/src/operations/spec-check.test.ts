// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { RunResult } from '@qa-ai-stlc/schemas';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import type { Runner, RunnerInput, RunnerOutcome } from '../runner.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { runSpecCheck } from './spec-check.js';
import { runTestRun } from './run.js';

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

function result(overrides: Partial<RunResult> & Pick<RunResult, 'id' | 'status'>): RunResult {
  return {
    schemaVersion: 1,
    runId: 'run-x',
    testCaseId: 'case-1',
    testType: 'e2e',
    startedAt: '2026-10-17T09:59:00.000Z',
    finishedAt: '2026-10-17T09:59:05.000Z',
    evidenceIds: [],
    ...overrides,
  };
}

function runnerReturning(outcomes: readonly RunnerOutcome[]): Runner & { received?: RunnerInput } {
  const runner: Runner & { received?: RunnerInput } = {
    testType: 'e2e',
    run: (_context, input) => {
      runner.received = input;
      return Promise.resolve(outcomes);
    },
  };
  return runner;
}

const OUTCOMES: readonly RunnerOutcome[] = [
  { result: result({ id: 'r1', status: 'passed' }), evidence: [] },
  {
    result: result({
      id: 'r2',
      testCaseId: 'case-2',
      status: 'failed',
      failure: { message: 'Expected "a", received "b"' },
    }),
    evidence: [{ kind: 'screenshot', content: new Uint8Array([1, 2, 3]) }],
  },
  {
    result: result({ id: 'r3', testCaseId: 'case-3', status: 'partial', missingStepIds: ['step-2'] }),
    evidence: [],
  },
];

function project() {
  const fs = createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG_YAML });
  return { fs, context: createFakeEngineContext({ fs }) };
}

describe('runSpecCheck', () => {
  it('says what each test did: status, a wrapped failure message and the steps it missed', async () => {
    const { context } = project();

    const summary = await runSpecCheck(context, {
      runner: runnerReturning(OUTCOMES),
      specFiles: ['tests/a.spec.ts'],
    });

    expect(summary.counts).toMatchObject({ passed: 1, failed: 1, partial: 1, blocked: 0 });
    expect(summary.results).toEqual([
      { testCaseId: 'case-1', status: 'passed' },
      {
        testCaseId: 'case-2',
        status: 'failed',
        failureMessage: expect.stringContaining('UNTRUSTED EVIDENCE BEGIN') as string,
      },
      { testCaseId: 'case-3', status: 'partial', missingStepIds: ['step-2'] },
    ]);
    expect(summary.results[1]?.failureMessage).toContain('Expected "a", received "b"');
  });

  it('writes nothing: no run record, result file, evidence or manifest entry', async () => {
    const { fs, context } = project();
    const before = [...(await fs.listFiles('project'))].sort();

    await runSpecCheck(context, { runner: runnerReturning(OUTCOMES), specFiles: ['tests/a.spec.ts'] });

    expect([...(await fs.listFiles('project'))].sort()).toEqual(before);
  });

  it('runs against the configured environment as a run would', async () => {
    const { context } = project();
    const runner = runnerReturning(OUTCOMES);

    await runSpecCheck(context, { runner, specFiles: ['tests/a.spec.ts'] });

    expect(runner.received).toMatchObject({
      baseUrl: 'https://staging.example.test/',
      environment: 'staging',
      testIdAttribute: 'data-testid',
    });
  });

  it('refuses a spec set that produced no result, as a run does', async () => {
    const { context } = project();

    await expect(
      runSpecCheck(context, { runner: runnerReturning([]), specFiles: ['tests/missing.spec.ts'] }),
    ).rejects.toMatchObject({ code: 'RUN_NO_RESULTS' });
  });

  it('leaves a run recorded by qa run as it was, and records nothing beside it', async () => {
    const { fs, context } = project();
    const runner = runnerReturning([OUTCOMES[0]!]);
    await runTestRun(context, { runner, specFiles: ['tests/a.spec.ts'] });
    const afterRun = [...(await fs.listFiles('project'))].sort();

    await runSpecCheck(context, { runner, specFiles: ['tests/a.spec.ts'] });

    expect([...(await fs.listFiles('project'))].sort()).toEqual(afterRun);
  });
});
