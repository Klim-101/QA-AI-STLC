// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { QaStore } from '../qa-store.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { runRunMetrics } from './run-metrics.js';

const CONFIG = [
  'schemaVersion: 1',
  'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
  'environments:',
  '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
  'identities: {}',
  'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
  'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
  'agents: { parallelism: 2, spokeTimeoutSeconds: 60, retries: 1 }',
  '',
].join('\n');

async function record(
  store: QaStore,
  runId: string,
  spokeId: string,
  taskId: string,
  attempt: number,
  inputAt: string,
  output?: { readonly at: string; readonly status: 'ok' | 'error' },
): Promise<void> {
  const base = `runs/${runId}/spokes/${spokeId}/${taskId}/attempt-${String(attempt)}`;
  await store.writeJson(`${base}/input.json`, {
    schemaVersion: 1,
    runId,
    spokeId,
    taskId,
    attempt,
    task: 'Do it',
    recordedAt: inputAt,
  });
  if (output !== undefined) {
    await store.writeJson(`${base}/output.json`, {
      schemaVersion: 1,
      runId,
      attempt,
      recordedAt: output.at,
      result:
        output.status === 'ok'
          ? { schemaVersion: 1, spokeId, taskId, status: 'ok', payload: {} }
          : { schemaVersion: 1, spokeId, taskId, status: 'error', error: { code: 'X', message: 'bad' } },
    });
  }
}

async function project(): Promise<EngineContext> {
  const fs = createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG });
  const context = createFakeEngineContext({ fs, clock: { now: () => new Date('2026-10-18T10:05:00.000Z') } });
  const store = new QaStore({ projectRoot: 'project', fs });
  await record(store, 'run-old', 'explorer', 'env', 1, '2026-10-18T08:00:00.000Z', {
    at: '2026-10-18T08:00:03.000Z',
    status: 'ok',
  });
  await record(store, 'run-new', 'explorer', 'env', 1, '2026-10-18T10:00:00.000Z', {
    at: '2026-10-18T10:00:04.000Z',
    status: 'error',
  });
  await record(store, 'run-new', 'explorer', 'env', 2, '2026-10-18T10:00:05.000Z', {
    at: '2026-10-18T10:00:09.000Z',
    status: 'ok',
  });
  await record(store, 'run-new', 'triage', 'run', 1, '2026-10-18T10:00:10.000Z');
  return context;
}

describe('runRunMetrics', () => {
  it('measures the named run from its spoke records and the configured budgets', async () => {
    const context = await project();

    const metrics = await runRunMetrics(context, { runId: 'run-new' });

    expect(metrics.runId).toBe('run-new');
    expect(metrics.budgets).toEqual({ parallelism: 2, spokeTimeoutSeconds: 60, retries: 1 });
    expect(metrics.dispatch).toMatchObject({
      tasks: 2,
      attempts: 3,
      okResponses: 1,
      errorResponses: 1,
      unanswered: 1,
    });
    expect(metrics.retries).toMatchObject({ used: 1, allowed: 2, tasksAtBudget: 1 });
    expect(metrics.timing).toMatchObject({ spanMs: 9000, busyMs: 8000 });
  });

  it('measures the run with the newest records when none is named, and keeps runs apart', async () => {
    const context = await project();

    const metrics = await runRunMetrics(context, {});

    expect(metrics.runId).toBe('run-new');
    expect((await runRunMetrics(context, { runId: 'run-old' })).dispatch.attempts).toBe(1);
  });

  it('refuses a run with no spoke records, a project with none, and a run id that is not a name', async () => {
    const context = await project();
    const empty = createFakeEngineContext({
      fs: createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: CONFIG }),
    });

    await expect(runRunMetrics(context, { runId: 'run-none' })).rejects.toMatchObject({
      code: 'RUN_METRICS_NO_SPOKES',
    });
    await expect(runRunMetrics(empty, {})).rejects.toMatchObject({ code: 'RUN_METRICS_NO_SPOKES' });
    await expect(runRunMetrics(context, { runId: '../escape' })).rejects.toMatchObject({
      code: 'RUN_METRICS_RUN_INVALID',
    });
  });
});
