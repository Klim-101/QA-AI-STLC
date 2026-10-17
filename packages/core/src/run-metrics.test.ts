// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { computeRunMetrics } from './run-metrics.js';
import type { SpokeAttempt } from './spoke-records.js';

const BUDGETS = { parallelism: 2, spokeTimeoutSeconds: 60, retries: 1 };
const BASE = Date.parse('2026-10-18T10:00:00.000Z');

function at(seconds: number): string {
  return new Date(BASE + seconds * 1000).toISOString();
}

function attempt(
  spokeId: string,
  taskId: string,
  attemptNumber: number,
  startSeconds: number,
  endSeconds?: number,
  status: 'ok' | 'error' = 'ok',
): SpokeAttempt {
  return {
    runId: 'run-1',
    spokeId,
    taskId,
    attempt: attemptNumber,
    inputAt: at(startSeconds),
    ...(endSeconds === undefined ? {} : { outputAt: at(endSeconds), status }),
  };
}

const NOW = BASE + 1000 * 1000;

describe('computeRunMetrics: dispatch and retries', () => {
  it('counts tasks, attempts and answers, per spoke, and the retries against the budget', () => {
    const metrics = computeRunMetrics(
      'run-1',
      [
        attempt('explorer', 'env', 1, 0, 4),
        attempt('test-design', 'a', 1, 5, 6, 'error'),
        attempt('test-design', 'a', 2, 7, 9),
        attempt('test-design', 'b', 1, 5, 8),
        attempt('triage', 'run', 1, 20),
      ],
      BUDGETS,
      BASE + 30_000,
    );

    expect(metrics.dispatch).toEqual({
      tasks: 4,
      attempts: 5,
      okResponses: 3,
      errorResponses: 1,
      unanswered: 1,
      bySpoke: [
        { spokeId: 'explorer', tasks: 1, attempts: 1, retriesUsed: 0 },
        { spokeId: 'test-design', tasks: 2, attempts: 3, retriesUsed: 1 },
        { spokeId: 'triage', tasks: 1, attempts: 1, retriesUsed: 0 },
      ],
    });
    expect(metrics.retries).toEqual({ used: 1, allowed: 4, tasksAtBudget: 1, tasksOverBudget: 0 });
    expect(metrics.budgets).toEqual(BUDGETS);
  });

  it('counts a task with more attempts than the budget gives', () => {
    const metrics = computeRunMetrics(
      'run-1',
      [attempt('a', 't', 1, 0, 1), attempt('a', 't', 2, 2, 3), attempt('a', 't', 3, 4, 5)],
      BUDGETS,
      NOW,
    );

    expect(metrics.retries).toMatchObject({ used: 2, allowed: 1, tasksAtBudget: 0, tasksOverBudget: 1 });
  });

  it('measures an empty run as zeros, with no span', () => {
    const metrics = computeRunMetrics('run-1', [], BUDGETS, NOW);

    expect(metrics.dispatch).toMatchObject({ tasks: 0, attempts: 0, bySpoke: [] });
    expect(metrics.timing).toEqual({
      spanMs: null,
      busyMs: 0,
      activeMs: 0,
      overlapSavingMs: 0,
      timedOutAttempts: 0,
    });
    expect(metrics.concurrency).toEqual({ peak: 0, isWithinBudget: true });
  });
});

describe('computeRunMetrics: time and concurrency', () => {
  it('takes the span from the first dispatch to the last answer, and sums busy time', () => {
    const metrics = computeRunMetrics(
      'run-1',
      [attempt('a', '1', 1, 2, 5), attempt('a', '2', 1, 10, 14)],
      BUDGETS,
      NOW,
    );

    expect(metrics.timing).toMatchObject({
      spanMs: 12_000,
      busyMs: 7000,
      activeMs: 7000,
      overlapSavingMs: 0,
    });
    expect(metrics.concurrency.peak).toBe(1);
  });

  it('says how much time overlapping attempts saved and how many ran at once', () => {
    const metrics = computeRunMetrics(
      'run-1',
      [attempt('a', '1', 1, 0, 10), attempt('a', '2', 1, 2, 6), attempt('a', '3', 1, 3, 12)],
      { ...BUDGETS, parallelism: 3 },
      NOW,
    );

    expect(metrics.timing).toMatchObject({
      busyMs: 23_000,
      activeMs: 12_000,
      overlapSavingMs: 11_000,
      spanMs: 12_000,
    });
    expect(metrics.concurrency).toEqual({ peak: 3, isWithinBudget: true });
  });

  it('does not count attempts that follow one another as overlapping', () => {
    const metrics = computeRunMetrics(
      'run-1',
      [attempt('a', '1', 1, 0, 5), attempt('a', '2', 1, 5, 9)],
      BUDGETS,
      NOW,
    );

    expect(metrics.concurrency.peak).toBe(1);
    expect(metrics.timing.overlapSavingMs).toBe(0);
  });

  it('reports a run that went over the parallelism budget', () => {
    const metrics = computeRunMetrics(
      'run-1',
      [attempt('a', '1', 1, 0, 10), attempt('a', '2', 1, 1, 9), attempt('a', '3', 1, 2, 8)],
      BUDGETS,
      NOW,
    );

    expect(metrics.concurrency).toEqual({ peak: 3, isWithinBudget: false });
  });

  it('counts a dispatch not yet answered as running until it is older than the timeout, then as timed out', () => {
    const running = computeRunMetrics(
      'run-1',
      [attempt('a', '1', 1, 0, 10), attempt('a', '2', 1, 5)],
      BUDGETS,
      BASE + 30_000,
    );
    const timedOut = computeRunMetrics(
      'run-1',
      [attempt('a', '1', 1, 0, 10), attempt('a', '2', 1, 5)],
      BUDGETS,
      BASE + 66_000,
    );

    expect(running.concurrency.peak).toBe(2);
    expect(running.timing.timedOutAttempts).toBe(0);
    expect(timedOut.concurrency.peak).toBe(1);
    expect(timedOut.timing.timedOutAttempts).toBe(1);
  });

  it('leaves the span empty when nothing was answered', () => {
    const metrics = computeRunMetrics('run-1', [attempt('a', '1', 1, 0)], BUDGETS, BASE + 10_000);

    expect(metrics.timing.spanMs).toBeNull();
  });

  it('treats an answer stamped before its dispatch as taking no time', () => {
    const metrics = computeRunMetrics('run-1', [attempt('a', '1', 1, 5, 3)], BUDGETS, NOW);

    expect(metrics.timing).toMatchObject({ busyMs: 0, activeMs: 0 });
  });

  it('has no field that claims a token count or a cost', () => {
    const metrics = computeRunMetrics('run-1', [attempt('a', '1', 1, 0, 1)], BUDGETS, NOW);
    const keys: string[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collect);
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, inner] of Object.entries(value)) {
          keys.push(key);
          collect(inner);
        }
      }
    };
    collect(metrics);

    expect(keys.filter((key) => /token|cost|usd|price/iu.test(key))).toEqual([]);
  });
});
