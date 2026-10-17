// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { runTriageAdd } from './triage-add.js';
import { runTriageInput } from './triage-input.js';

const CONFIG_YAML = [
  'schemaVersion: 1',
  'testing: { e2e: in-scope, api: out-of-scope, a11y: out-of-scope, security: out-of-scope }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
  'flaky: { historyWindow: 6, minStatusChanges: 2 }',
  '',
].join('\n');

interface ResultSpec {
  readonly id: string;
  readonly runId: string;
  readonly testCaseId: string;
  readonly status: 'passed' | 'failed' | 'blocked';
  readonly minute: number;
  readonly message?: string;
  readonly evidenceIds?: readonly string[];
}

function runResult(spec: ResultSpec): Record<string, unknown> {
  const at = `2026-10-10T10:${String(spec.minute).padStart(2, '0')}:00Z`;
  return {
    schemaVersion: 1,
    id: spec.id,
    runId: spec.runId,
    testCaseId: spec.testCaseId,
    testType: 'e2e',
    status: spec.status,
    startedAt: at,
    finishedAt: at,
    evidenceIds: spec.evidenceIds ?? [],
    ...(spec.status === 'failed' ? { failure: { message: spec.message ?? 'Timeout 5000ms exceeded.' } } : {}),
  };
}

async function projectWith(
  results: readonly ResultSpec[],
  evidence: Readonly<Record<string, string>> = {},
): Promise<EngineContext> {
  const fs = createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG_YAML });
  const context = createFakeEngineContext({ fs });
  const store = new QaStore({ projectRoot: 'project', fs });
  const manifest = new ManifestStore({ store });
  for (const spec of results) {
    await store.writeJson(`runs/${spec.runId}/results/${spec.id}.json`, runResult(spec));
  }
  for (const [path, content] of Object.entries(evidence)) {
    await store.writeBytes(path, content);
    await manifest.register(path, content);
  }
  const testCase = {
    id: 'login',
    feature: 'auth',
    requirementIds: ['req-login'],
    testType: 'e2e',
    title: 'A user can log in',
    steps: [{ description: 'Log in' }],
    expectedResult: 'The dashboard loads',
    status: 'approved',
    createdAt: '2026-10-01T09:00:00Z',
  };
  await store.writeText('artifacts/cases/auth/login.json', toCanonicalJson(testCase));
  return context;
}

const FAILING_RUN: readonly ResultSpec[] = [
  { id: 'r1-login', runId: 'run-1', testCaseId: 'login', status: 'failed', minute: 1, evidenceIds: ['ev-1'] },
  { id: 'r1-other', runId: 'run-1', testCaseId: 'checkout', status: 'passed', minute: 2 },
];

function triageWith(entries: readonly Record<string, unknown>[], runId = 'run-1'): Record<string, unknown> {
  return { schemaVersion: 1, runId, entries, createdAt: '2026-10-11T09:00:00Z' };
}

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resultId: 'r1-login',
    testCaseId: 'login',
    category: 'product-bug',
    confidence: 'medium',
    reasons: ['The dashboard never loads after valid credentials.'],
    evidencePaths: [],
    ...overrides,
  };
}

describe('runTriageInput', () => {
  it('lists the failed results of the run with a hint, evidence, history and the flaky flag', async () => {
    const context = await projectWith(FAILING_RUN, { 'evidence/run-1/ev-1.txt': 'page said: server error' });

    const input = await runTriageInput(context, { runId: 'run-1' });

    expect(input.omittedFailureCount).toBe(0);
    expect(input.failures).toHaveLength(1);
    expect(input.failures[0]).toMatchObject({
      resultId: 'r1-login',
      testCaseId: 'login',
      title: 'A user can log in',
      testType: 'e2e',
      failureKind: 'other',
      isFlaky: false,
      history: [{ runId: 'run-1', status: 'failed' }],
    });
    expect(input.failures[0]?.failureMessage).toContain('UNTRUSTED EVIDENCE BEGIN');
    expect(input.failures[0]?.evidence[0]).toMatchObject({ path: 'evidence/run-1/ev-1.txt' });
    expect(input.failures[0]?.evidence[0]?.excerpt).toContain('server error');
  });

  it('reads the failure kind off the message', async () => {
    const context = await projectWith([
      {
        id: 'a',
        runId: 'run-1',
        testCaseId: 'login',
        status: 'failed',
        minute: 1,
        message: 'net::ERR_CONNECTION_REFUSED at http://x',
      },
    ]);

    expect((await runTriageInput(context, { runId: 'run-1' })).failures[0]?.failureKind).toBe('network');
  });

  it('calls a case flaky when its recorded history flips often enough', async () => {
    const context = await projectWith([
      { id: 'h1', runId: 'run-0', testCaseId: 'login', status: 'passed', minute: 0 },
      { id: 'h2', runId: 'run-0b', testCaseId: 'login', status: 'failed', minute: 1 },
      { id: 'h3', runId: 'run-0c', testCaseId: 'login', status: 'passed', minute: 2 },
      { id: 'r1-login', runId: 'run-1', testCaseId: 'login', status: 'failed', minute: 3 },
    ]);

    const input = await runTriageInput(context, { runId: 'run-1' });

    expect(input.failures[0]?.isFlaky).toBe(true);
    expect(input.failures[0]?.history.map((recorded) => recorded.status)).toEqual([
      'passed',
      'failed',
      'passed',
      'failed',
    ]);
  });

  it('caps the failures it lists and says how many it left out', async () => {
    const many = Array.from({ length: 27 }, (_unused, index) => ({
      id: `r-${String(index).padStart(2, '0')}`,
      runId: 'run-1',
      testCaseId: `case-${String(index).padStart(2, '0')}`,
      status: 'failed' as const,
      minute: 1,
    }));
    const context = await projectWith(many);

    const input = await runTriageInput(context, { runId: 'run-1' });

    expect(input.failures).toHaveLength(25);
    expect(input.omittedFailureCount).toBe(2);
    expect(input.failures[0]).not.toHaveProperty('title');
  });

  it('lists nothing for a run in which nothing failed', async () => {
    const context = await projectWith([
      { id: 'ok', runId: 'run-1', testCaseId: 'login', status: 'passed', minute: 1 },
    ]);

    expect(await runTriageInput(context, { runId: 'run-1' })).toMatchObject({
      failures: [],
      omittedFailureCount: 0,
    });
  });

  it('refuses a run no result belongs to, and a missing or unsafe run id', async () => {
    const context = await projectWith(FAILING_RUN);

    await expect(runTriageInput(context, { runId: 'run-9' })).rejects.toMatchObject({
      code: 'TRIAGE_RUN_NOT_FOUND',
    });
    await expect(runTriageInput(context, {})).rejects.toMatchObject({ code: 'TRIAGE_INPUT_USAGE' });
    await expect(runTriageInput(context, { runId: '../x' })).rejects.toMatchObject({
      code: 'TRIAGE_INPUT_USAGE',
    });
  });

  it('refuses evidence that changed after it was registered', async () => {
    const context = await projectWith(FAILING_RUN, { 'evidence/run-1/ev-1.txt': 'original' });
    await context.fs.writeFile(join('project', '.qa', 'evidence', 'run-1', 'ev-1.txt'), 'edited by hand');

    await expect(runTriageInput(context, { runId: 'run-1' })).rejects.toMatchObject({
      code: 'ARTIFACT_HASH_MISMATCH',
    });
  });
});

describe('runTriageAdd', () => {
  it('registers a triage that classifies every failed result', async () => {
    const context = await projectWith(FAILING_RUN, { 'evidence/run-1/ev-1.txt': 'x' });

    const result = await runTriageAdd(context, {
      triage: triageWith([entry({ evidencePaths: ['evidence/run-1/ev-1.txt'] })]),
    });

    expect(result).toEqual({ runId: 'run-1', triagePath: 'artifacts/triage/run-1.json', entryCount: 1 });
    expect(await context.fs.readFile(join('project', '.qa', 'artifacts', 'triage', 'run-1.json'))).toContain(
      'product-bug',
    );
    const manifest = await new ManifestStore({
      store: new QaStore({ projectRoot: 'project', fs: context.fs }),
    }).load();
    expect(manifest.artifacts).toHaveProperty(['artifacts/triage/run-1.json']);
  });

  it('replaces the earlier triage of the same run', async () => {
    const context = await projectWith(FAILING_RUN);
    await runTriageAdd(context, { triage: triageWith([entry()]) });

    await runTriageAdd(context, {
      triage: triageWith([entry({ category: 'uncertain', confidence: 'low' })]),
    });

    expect(await context.fs.readFile(join('project', '.qa', 'artifacts', 'triage', 'run-1.json'))).toContain(
      'uncertain',
    );
  });

  it('reads the triage from a file', async () => {
    const context = await projectWith(FAILING_RUN);
    await context.fs.writeFile(join('project', 'triage.json'), JSON.stringify(triageWith([entry()])));

    expect((await runTriageAdd(context, { path: 'triage.json' })).entryCount).toBe(1);
  });

  it('refuses a triage given both ways, neither way, or from a file that is not there', async () => {
    const context = await projectWith(FAILING_RUN);

    await expect(
      runTriageAdd(context, { path: 'a.json', triage: triageWith([entry()]) }),
    ).rejects.toMatchObject({
      code: 'TRIAGE_ADD_USAGE',
    });
    await expect(runTriageAdd(context, {})).rejects.toMatchObject({ code: 'TRIAGE_ADD_USAGE' });
    await expect(runTriageAdd(context, { path: 'missing.json' })).rejects.toMatchObject({
      code: 'TRIAGE_ADD_FILE_NOT_FOUND',
    });
  });

  it('refuses a triage that does not match its schema', async () => {
    const context = await projectWith(FAILING_RUN);

    await expect(
      runTriageAdd(context, { triage: triageWith([entry({ category: 'cosmic-rays' })]) }),
    ).rejects.toMatchObject({ code: 'TRIAGE_INVALID' });
  });

  it('refuses a run no result belongs to', async () => {
    const context = await projectWith(FAILING_RUN);

    await expect(runTriageAdd(context, { triage: triageWith([entry()], 'run-9') })).rejects.toMatchObject({
      code: 'TRIAGE_RUN_NOT_FOUND',
    });
  });

  it('refuses a run id that could leave the triage folder', async () => {
    const context = await projectWith(FAILING_RUN);

    await expect(runTriageAdd(context, { triage: triageWith([entry()], '../escape') })).rejects.toMatchObject(
      {
        code: 'TRIAGE_INVALID',
      },
    );
  });

  it('refuses a result classified twice', async () => {
    const context = await projectWith(FAILING_RUN);

    await expect(runTriageAdd(context, { triage: triageWith([entry(), entry()]) })).rejects.toMatchObject({
      code: 'TRIAGE_DUPLICATE_RESULT',
    });
  });

  it('refuses an entry for a result that did not fail, or that does not exist', async () => {
    const context = await projectWith(FAILING_RUN);

    await expect(
      runTriageAdd(context, {
        triage: triageWith([entry(), entry({ resultId: 'r1-other', testCaseId: 'checkout' })]),
      }),
    ).rejects.toMatchObject({ code: 'TRIAGE_RESULT_NOT_FAILED' });
    await expect(
      runTriageAdd(context, { triage: triageWith([entry({ resultId: 'invented' })]) }),
    ).rejects.toMatchObject({ code: 'TRIAGE_RESULT_NOT_FAILED' });
  });

  it('refuses an entry that names another result’s case', async () => {
    const context = await projectWith(FAILING_RUN);

    await expect(
      runTriageAdd(context, { triage: triageWith([entry({ testCaseId: 'checkout' })]) }),
    ).rejects.toMatchObject({ code: 'TRIAGE_CASE_MISMATCH' });
  });

  it('refuses evidence that is not the result’s, even when the engine registered it', async () => {
    const context = await projectWith(FAILING_RUN, {
      'evidence/run-1/ev-1.txt': 'x',
      'evidence/run-1/ev-2.txt': 'y',
    });

    await expect(
      runTriageAdd(context, { triage: triageWith([entry({ evidencePaths: ['evidence/run-1/ev-2.txt'] })]) }),
    ).rejects.toMatchObject({ code: 'TRIAGE_EVIDENCE_NOT_OF_RESULT' });
  });

  it('refuses a triage that leaves a failure out', async () => {
    const context = await projectWith([
      ...FAILING_RUN,
      { id: 'r1-second', runId: 'run-1', testCaseId: 'second', status: 'failed', minute: 3 },
    ]);

    await expect(runTriageAdd(context, { triage: triageWith([entry()]) })).rejects.toMatchObject({
      code: 'TRIAGE_FAILURES_UNCLASSIFIED',
    });
  });

  it('refuses flaky for a case whose history is not flaky', async () => {
    const context = await projectWith(FAILING_RUN);

    await expect(
      runTriageAdd(context, { triage: triageWith([entry({ category: 'flaky' })]) }),
    ).rejects.toMatchObject({ code: 'TRIAGE_FLAKY_WITHOUT_HISTORY' });
  });

  it('accepts flaky for a case whose history flips', async () => {
    const context = await projectWith([
      { id: 'h1', runId: 'run-0', testCaseId: 'login', status: 'passed', minute: 0 },
      { id: 'h2', runId: 'run-0b', testCaseId: 'login', status: 'failed', minute: 1 },
      { id: 'h3', runId: 'run-0c', testCaseId: 'login', status: 'passed', minute: 2 },
      { id: 'r1-login', runId: 'run-1', testCaseId: 'login', status: 'failed', minute: 3 },
    ]);

    expect(
      (await runTriageAdd(context, { triage: triageWith([entry({ category: 'flaky' })]) })).entryCount,
    ).toBe(1);
  });
});
