// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { createFakeHttpClient } from '@qa-ai-stlc/test-utils/fake-http-client';
import { createFakeProcessRunner } from '@qa-ai-stlc/test-utils/fake-process-runner';
import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../engine-context.js';
import { noopLogger } from '../ports/logger.js';
import {
  MAX_SPOKE_RECORD_BYTES,
  runSpokeList,
  runSpokeRecordInput,
  runSpokeRecordOutput,
} from './spoke-io.js';

const PROJECT_ROOT = join('project');
const QA_DIR = join(PROJECT_ROOT, '.qa');

interface Budgets {
  readonly parallelism: number;
  readonly spokeTimeoutSeconds: number;
  readonly retries: number;
}

const GENEROUS_BUDGETS: Budgets = { parallelism: 10, spokeTimeoutSeconds: 300, retries: 5 };

function configYaml(budgets: Budgets): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
    'environments:',
    '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    `agents: { parallelism: ${String(budgets.parallelism)}, spokeTimeoutSeconds: ${String(budgets.spokeTimeoutSeconds)}, retries: ${String(budgets.retries)} }`,
    '',
  ].join('\n');
}

interface TestClock {
  current: Date;
  now: () => Date;
}

function fakeClock(): TestClock {
  const clock: TestClock = { current: new Date('2026-10-15T12:00:00Z'), now: () => clock.current };
  return clock;
}

function fakeContext(budgets: Budgets = GENEROUS_BUDGETS, clock: TestClock = fakeClock()): EngineContext {
  return {
    projectRoot: PROJECT_ROOT,
    fs: createFakeFileSystem({ [join(QA_DIR, 'config.yaml')]: configYaml(budgets) }),
    clock,
    logger: noopLogger,
    processRunner: createFakeProcessRunner({ exitCode: 0, stdout: '', stderr: '' }),
    httpClient: createFakeHttpClient({ ok: true, status: 200 }),
    browserLauncher: createFakeBrowserLauncher(),
    env: {},
  };
}

const INPUT = {
  runId: 'run-1',
  spokeId: 'explorer-page',
  taskId: 'page-1',
  task: 'Analyze the dashboard page',
  context: { url: 'https://example.com/dashboard' },
} as const;

const OK_RESULT = { spokeId: 'explorer-page', taskId: 'page-1', status: 'ok', payload: { elements: 3 } };

async function readStored(context: EngineContext, path: string): Promise<unknown> {
  return JSON.parse(await context.fs.readFile(join(QA_DIR, ...path.split('/')))) as unknown;
}

describe('runSpokeRecordInput', () => {
  it('stores the input under the run, spoke, task and attempt', async () => {
    const context = fakeContext();

    const result = await runSpokeRecordInput(context, INPUT);

    expect(result).toEqual({
      status: 'recorded',
      attempt: 1,
      inputPath: 'runs/run-1/spokes/explorer-page/page-1/attempt-1/input.json',
      wasRedacted: false,
    });
    expect(await readStored(context, result.inputPath ?? '')).toMatchObject({
      runId: 'run-1',
      spokeId: 'explorer-page',
      taskId: 'page-1',
      attempt: 1,
      task: 'Analyze the dashboard page',
      context: { url: 'https://example.com/dashboard' },
      recordedAt: '2026-10-15T12:00:00.000Z',
    });
  });

  it('numbers a retry of the same task as the next attempt and keeps the first', async () => {
    const context = fakeContext();

    const first = await runSpokeRecordInput(context, INPUT);
    const second = await runSpokeRecordInput(context, INPUT);
    const other = await runSpokeRecordInput(context, { ...INPUT, taskId: 'page-2' });

    expect([first.attempt, second.attempt, other.attempt]).toEqual([1, 2, 1]);
    expect(await context.fs.pathExists(join(QA_DIR, ...(first.inputPath ?? '').split('/')))).toBe(true);
  });

  it('does not count a stray folder under the task as an attempt', async () => {
    const context = fakeContext();
    await context.fs.writeFile(
      join(QA_DIR, 'runs', 'run-1', 'spokes', 'explorer-page', 'page-1', 'notes', 'input.json'),
      '{}',
    );

    expect((await runSpokeRecordInput(context, INPUT)).attempt).toBe(1);
  });

  it('records a task that has no context', async () => {
    const context = fakeContext();

    const result = await runSpokeRecordInput(context, { ...INPUT, context: undefined });

    expect(await readStored(context, result.inputPath ?? '')).not.toHaveProperty('context');
  });

  it('redacts secrets in the task and the context, wherever they sit, and says so', async () => {
    const context = fakeContext();
    const token = `Bearer ${'a'.repeat(24)}`;

    const result = await runSpokeRecordInput(context, {
      ...INPUT,
      task: `Call the API with ${token}`,
      context: { headers: [{ authorization: token }], count: 2, nothing: null },
    });

    const stored = JSON.stringify(await readStored(context, result.inputPath ?? ''));
    expect(result.wasRedacted).toBe(true);
    expect(stored).not.toContain('aaaaaaaa');
    expect(stored).toContain('[REDACTED]');
    expect(stored).toContain('"count":2');
  });

  it.each([
    ['runId', { runId: '../escape' }],
    ['spokeId', { spokeId: 'a/b' }],
    ['taskId', { taskId: '' }],
  ])('refuses a %s that could leave its folder', async (_name, override) => {
    await expect(runSpokeRecordInput(fakeContext(), { ...INPUT, ...override })).rejects.toMatchObject({
      code: 'SPOKE_NAME_INVALID',
    });
  });

  it('refuses a task that is empty', async () => {
    await expect(runSpokeRecordInput(fakeContext(), { ...INPUT, task: '' })).rejects.toMatchObject({
      code: 'SPOKE_INPUT_INVALID',
    });
  });

  it('refuses a record larger than the cap and points to a reference instead', async () => {
    const error: unknown = await runSpokeRecordInput(fakeContext(), {
      ...INPUT,
      context: 'x'.repeat(MAX_SPOKE_RECORD_BYTES),
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'SPOKE_RECORD_TOO_LARGE' });
  });
});

describe('runSpokeRecordOutput', () => {
  it('stores the result next to its input', async () => {
    const context = fakeContext();
    const { attempt } = await runSpokeRecordInput(context, INPUT);

    const result = await runSpokeRecordOutput(context, { runId: 'run-1', attempt, result: OK_RESULT });

    expect(result).toEqual({
      attempt: 1,
      outputPath: 'runs/run-1/spokes/explorer-page/page-1/attempt-1/output.json',
      status: 'ok',
      wasRedacted: false,
      wasAlreadyRecorded: false,
    });
    expect(await readStored(context, result.outputPath)).toMatchObject({
      runId: 'run-1',
      attempt: 1,
      result: { ...OK_RESULT, schemaVersion: 1 },
    });
  });

  it('records an error result with its status', async () => {
    const context = fakeContext();
    await runSpokeRecordInput(context, INPUT);

    const result = await runSpokeRecordOutput(context, {
      runId: 'run-1',
      attempt: 1,
      result: {
        spokeId: 'explorer-page',
        taskId: 'page-1',
        status: 'error',
        error: { code: 'SPOKE_TIMEOUT', message: 'No answer in time.' },
      },
    });

    expect(result.status).toBe('error');
  });

  it('refuses an output whose attempt has no recorded input', async () => {
    await expect(
      runSpokeRecordOutput(fakeContext(), { runId: 'run-1', attempt: 1, result: OK_RESULT }),
    ).rejects.toMatchObject({ code: 'SPOKE_OUTPUT_WITHOUT_INPUT' });
  });

  it('records the same result again as a no-op', async () => {
    const context = fakeContext();
    await runSpokeRecordInput(context, INPUT);
    await runSpokeRecordOutput(context, { runId: 'run-1', attempt: 1, result: OK_RESULT });

    const again = await runSpokeRecordOutput(context, { runId: 'run-1', attempt: 1, result: OK_RESULT });

    expect(again).toMatchObject({ status: 'ok', wasAlreadyRecorded: true });
  });

  it('refuses a different result for an attempt that already has one', async () => {
    const context = fakeContext();
    await runSpokeRecordInput(context, INPUT);
    await runSpokeRecordOutput(context, { runId: 'run-1', attempt: 1, result: OK_RESULT });

    await expect(
      runSpokeRecordOutput(context, {
        runId: 'run-1',
        attempt: 1,
        result: { ...OK_RESULT, payload: { elements: 4 } },
      }),
    ).rejects.toMatchObject({ code: 'SPOKE_OUTPUT_EXISTS' });
  });

  it('redacts secrets in the payload and says so', async () => {
    const context = fakeContext();
    await runSpokeRecordInput(context, INPUT);

    const result = await runSpokeRecordOutput(context, {
      runId: 'run-1',
      attempt: 1,
      result: { ...OK_RESULT, payload: { note: `token Bearer ${'b'.repeat(24)}` } },
    });

    expect(result.wasRedacted).toBe(true);
    expect(JSON.stringify(await readStored(context, result.outputPath))).not.toContain('bbbbbbbb');
  });

  it('names the invalid field of a result that does not match the envelope', async () => {
    const error: unknown = await runSpokeRecordOutput(fakeContext(), {
      runId: 'run-1',
      attempt: 1,
      result: { spokeId: 'explorer-page', taskId: 'page-1', status: 'maybe' },
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'SPOKE_RESULT_INVALID' });
    expect((error as { remediation?: string }).remediation).toContain('status:');
  });

  it('refuses a result whose spoke name could leave its folder', async () => {
    await expect(
      runSpokeRecordOutput(fakeContext(), {
        runId: 'run-1',
        attempt: 1,
        result: { ...OK_RESULT, spokeId: '../escape' },
      }),
    ).rejects.toMatchObject({ code: 'SPOKE_NAME_INVALID' });
  });
});

describe('runSpokeList', () => {
  it('lists every attempt with the status of its output, in a stable order', async () => {
    const context = fakeContext();
    await runSpokeRecordInput(context, { ...INPUT, taskId: 'page-2' });
    await runSpokeRecordInput(context, INPUT);
    await runSpokeRecordInput(context, INPUT);
    await runSpokeRecordOutput(context, {
      runId: 'run-1',
      attempt: 1,
      result: {
        spokeId: 'explorer-page',
        taskId: 'page-1',
        status: 'error',
        error: { code: 'X', message: 'bad' },
      },
    });
    await runSpokeRecordOutput(context, { runId: 'run-1', attempt: 2, result: OK_RESULT });
    await runSpokeRecordInput(context, { ...INPUT, spokeId: 'test-design', taskId: 'case-1' });

    const { records } = await runSpokeList(context, { runId: 'run-1' });

    expect(records.map((record) => [record.spokeId, record.taskId, record.attempt, record.status])).toEqual([
      ['explorer-page', 'page-1', 1, 'error'],
      ['explorer-page', 'page-1', 2, 'ok'],
      ['explorer-page', 'page-2', 1, undefined],
      ['test-design', 'case-1', 1, undefined],
    ]);
    expect(records[0]).toMatchObject({
      inputPath: 'runs/run-1/spokes/explorer-page/page-1/attempt-1/input.json',
      outputPath: 'runs/run-1/spokes/explorer-page/page-1/attempt-1/output.json',
    });
    expect(records[2]).not.toHaveProperty('outputPath');
  });

  it('lists nothing for a run that recorded no spoke', async () => {
    expect(await runSpokeList(fakeContext(), { runId: 'run-9' })).toEqual({ runId: 'run-9', records: [] });
  });

  it('ignores a file under the run that is not an attempt record', async () => {
    const context = fakeContext();
    await context.fs.writeFile(
      join(QA_DIR, 'runs', 'run-1', 'spokes', 'explorer-page', 'page-1', 'notes', 'input.json'),
      '{}',
    );
    await context.fs.writeFile(join(QA_DIR, 'runs', 'run-1', 'spokes', 'stray', 'input.json'), '{}');

    expect(await runSpokeList(context, { runId: 'run-1' })).toEqual({ runId: 'run-1', records: [] });
  });

  it('refuses a run id that could leave its folder', async () => {
    await expect(runSpokeList(fakeContext(), { runId: '..' })).rejects.toMatchObject({
      code: 'SPOKE_NAME_INVALID',
    });
  });
});

describe('spoke budgets (P4-02)', () => {
  const TIGHT: Budgets = { parallelism: 2, spokeTimeoutSeconds: 60, retries: 1 };

  it('refuses a dispatch while agents.parallelism spokes of the run are running', async () => {
    const context = fakeContext(TIGHT);
    await runSpokeRecordInput(context, { ...INPUT, taskId: 'page-a' });
    await runSpokeRecordInput(context, { ...INPUT, taskId: 'page-b' });

    const error: unknown = await runSpokeRecordInput(context, { ...INPUT, taskId: 'page-c' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ code: 'SPOKE_PARALLELISM_EXCEEDED' });
    expect(await runSpokeList(context, { runId: 'run-1' })).toMatchObject({
      records: [{ taskId: 'page-a' }, { taskId: 'page-b' }],
    });
  });

  it('frees a slot once a running spoke has its output recorded', async () => {
    const context = fakeContext(TIGHT);
    await runSpokeRecordInput(context, { ...INPUT, taskId: 'page-a' });
    await runSpokeRecordInput(context, { ...INPUT, taskId: 'page-b' });
    await runSpokeRecordOutput(context, {
      runId: 'run-1',
      attempt: 1,
      result: { ...OK_RESULT, taskId: 'page-a' },
    });

    const third = await runSpokeRecordInput(context, { ...INPUT, taskId: 'page-c' });

    expect(third.status).toBe('recorded');
  });

  it('counts the running spokes of one run only', async () => {
    const context = fakeContext({ ...TIGHT, parallelism: 1 });
    await runSpokeRecordInput(context, { ...INPUT, runId: 'run-1' });

    expect((await runSpokeRecordInput(context, { ...INPUT, runId: 'run-2' })).status).toBe('recorded');
  });

  it('stops counting a spoke that never answered once its timeout has passed', async () => {
    const clock = fakeClock();
    const context = fakeContext({ ...TIGHT, parallelism: 1 }, clock);
    await runSpokeRecordInput(context, INPUT);

    clock.current = new Date(clock.current.getTime() + 60_000);
    await expect(runSpokeRecordInput(context, { ...INPUT, taskId: 'page-2' })).rejects.toMatchObject({
      code: 'SPOKE_PARALLELISM_EXCEEDED',
    });

    clock.current = new Date(clock.current.getTime() + 1);
    const next = await runSpokeRecordInput(context, { ...INPUT, taskId: 'page-2' });
    expect(next.status).toBe('recorded');
  });

  it('answers with a coded budget error and stores nothing once a task used its attempts', async () => {
    const context = fakeContext(TIGHT);
    await runSpokeRecordInput(context, INPUT);
    await runSpokeRecordOutput(context, {
      runId: 'run-1',
      attempt: 1,
      result: { ...OK_RESULT, status: 'error', payload: undefined, error: { code: 'X', message: 'bad' } },
    });
    const retry = await runSpokeRecordInput(context, INPUT);
    await runSpokeRecordOutput(context, {
      runId: 'run-1',
      attempt: 2,
      result: { ...OK_RESULT, status: 'error', payload: undefined, error: { code: 'X', message: 'bad' } },
    });

    const exhausted = await runSpokeRecordInput(context, INPUT);

    expect(retry).toMatchObject({ status: 'recorded', attempt: 2 });
    expect(exhausted).toMatchObject({
      status: 'retry_budget_exhausted',
      attempt: 3,
      wasRedacted: false,
      budgetError: { code: 'SPOKE_RETRY_BUDGET_EXCEEDED' },
    });
    expect(exhausted).not.toHaveProperty('inputPath');
    expect(exhausted.budgetError?.remediation).toContain('blocked');
    const attempts = (await runSpokeList(context, { runId: 'run-1' })).records.map(
      (record) => record.attempt,
    );
    expect(attempts).toEqual([1, 2]);
  });

  it('with agents.retries of 0 allows the first attempt only', async () => {
    const context = fakeContext({ ...TIGHT, retries: 0 });
    await runSpokeRecordInput(context, INPUT);

    expect((await runSpokeRecordInput(context, INPUT)).status).toBe('retry_budget_exhausted');
  });

  it('refuses an output that arrives after the spoke timeout and stores nothing', async () => {
    const clock = fakeClock();
    const context = fakeContext(TIGHT, clock);
    const { inputPath } = await runSpokeRecordInput(context, INPUT);
    clock.current = new Date(clock.current.getTime() + 61_000);

    const error: unknown = await runSpokeRecordOutput(context, {
      runId: 'run-1',
      attempt: 1,
      result: OK_RESULT,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'SPOKE_TIMEOUT_EXCEEDED' });
    expect(await context.fs.pathExists(join(QA_DIR, ...(inputPath ?? '').split('/')))).toBe(true);
    expect((await runSpokeList(context, { runId: 'run-1' })).records[0]).not.toHaveProperty('outputPath');
  });

  it('accepts an output exactly at the timeout and records the same late output again as a no-op', async () => {
    const clock = fakeClock();
    const context = fakeContext(TIGHT, clock);
    await runSpokeRecordInput(context, INPUT);
    clock.current = new Date(clock.current.getTime() + 60_000);
    await runSpokeRecordOutput(context, { runId: 'run-1', attempt: 1, result: OK_RESULT });

    clock.current = new Date(clock.current.getTime() + 600_000);
    const again = await runSpokeRecordOutput(context, { runId: 'run-1', attempt: 1, result: OK_RESULT });

    expect(again.wasAlreadyRecorded).toBe(true);
  });

  it('needs the project configuration, which holds the budgets', async () => {
    const context = { ...fakeContext(), fs: createFakeFileSystem() };

    await expect(runSpokeRecordInput(context, INPUT)).rejects.toMatchObject({ code: 'CONFIG_MISSING' });
  });
});
