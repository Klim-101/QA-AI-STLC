// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  type AgentsConfig,
  type RunMetrics,
  type RunMetricsSpoke,
} from '@qa-ai-stlc/schemas';
import type { SpokeAttempt } from './spoke-records.js';

interface Interval {
  readonly startMs: number;
  readonly endMs: number;
}

function groupBy<TItem>(items: readonly TItem[], keyOf: (item: TItem) => string): Map<string, TItem[]> {
  const groups = new Map<string, TItem[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function intervalOf(inputAt: string, outputAt: string): Interval {
  const startMs = new Date(inputAt).getTime();
  return { startMs, endMs: Math.max(startMs, new Date(outputAt).getTime()) };
}

// The time covered by at least one interval: the intervals, merged.
function unionLengthMs(intervals: readonly Interval[]): number {
  let total = 0;
  let open: Interval | undefined;
  for (const interval of intervals.toSorted((a, b) => a.startMs - b.startMs)) {
    if (open === undefined) {
      open = interval;
    } else if (interval.startMs > open.endMs) {
      total += open.endMs - open.startMs;
      open = interval;
    } else {
      open = { startMs: open.startMs, endMs: Math.max(open.endMs, interval.endMs) };
    }
  }
  return open === undefined ? total : total + (open.endMs - open.startMs);
}

// The most intervals overlapping at one instant. One that ends when another starts does not overlap
// it, so ends are counted before starts at the same instant.
function peakOverlap(intervals: readonly Interval[]): number {
  const events = intervals
    .flatMap((interval) => [
      { atMs: interval.startMs, change: 1 },
      { atMs: interval.endMs, change: -1 },
    ])
    .toSorted((a, b) => a.atMs - b.atMs || a.change - b.change);
  let running = 0;
  let peak = 0;
  for (const event of events) {
    running += event.change;
    peak = Math.max(peak, running);
  }
  return peak;
}

/**
 * Measures how a run of the agent layer was carried out from its spoke attempts and the `agents`
 * budgets (P4-10): dispatch and retry counts against the budget, wall-clock and busy time, and how
 * many attempts ran at once. An attempt not yet answered is in flight until it is older than the
 * spoke timeout; after that it counts as timed out. Nothing here is read from a host transcript, so
 * there is no token count.
 */
export function computeRunMetrics(
  runId: string,
  attempts: readonly SpokeAttempt[],
  budgets: Pick<AgentsConfig, 'parallelism' | 'spokeTimeoutSeconds' | 'retries'>,
  nowMs: number,
): RunMetrics {
  const timeoutMs = budgets.spokeTimeoutSeconds * 1000;
  const maxAttempts = budgets.retries + 1;
  const attemptsByTask = groupBy(attempts, (attempt) => `${attempt.spokeId}/${attempt.taskId}`);
  const bySpokeId = groupBy(attempts, (attempt) => attempt.spokeId);

  const bySpoke: RunMetricsSpoke[] = [...bySpokeId.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([spokeId, own]) => {
      const tasks = groupBy(own, (attempt) => attempt.taskId);
      return {
        spokeId,
        tasks: tasks.size,
        attempts: own.length,
        retriesUsed: own.length - tasks.size,
      };
    });

  const answered = attempts.flatMap((attempt) =>
    attempt.outputAt === undefined ? [] : [intervalOf(attempt.inputAt, attempt.outputAt)],
  );
  const unanswered = attempts.filter((attempt) => attempt.outputAt === undefined);
  const inFlight: Interval[] = [];
  let timedOutAttempts = 0;
  for (const attempt of unanswered) {
    const startMs = new Date(attempt.inputAt).getTime();
    if (nowMs - startMs > timeoutMs) {
      timedOutAttempts += 1;
    } else {
      inFlight.push({ startMs, endMs: nowMs });
    }
  }

  const busyMs = answered.reduce((total, interval) => total + (interval.endMs - interval.startMs), 0);
  const activeMs = unionLengthMs(answered);
  const starts = attempts.map((attempt) => new Date(attempt.inputAt).getTime());
  const ends = answered.map((interval) => interval.endMs);
  const peak = peakOverlap([...answered, ...inFlight]);
  const tasksAtBudget = [...attemptsByTask.values()].filter((own) => own.length === maxAttempts).length;

  return {
    schemaVersion: SCHEMA_VERSION,
    runId,
    budgets: {
      parallelism: budgets.parallelism,
      spokeTimeoutSeconds: budgets.spokeTimeoutSeconds,
      retries: budgets.retries,
    },
    dispatch: {
      tasks: attemptsByTask.size,
      attempts: attempts.length,
      okResponses: attempts.filter((attempt) => attempt.status === 'ok').length,
      errorResponses: attempts.filter((attempt) => attempt.status === 'error').length,
      unanswered: unanswered.length,
      bySpoke,
    },
    retries: {
      used: attempts.length - attemptsByTask.size,
      allowed: attemptsByTask.size * budgets.retries,
      tasksAtBudget,
      tasksOverBudget: [...attemptsByTask.values()].filter((own) => own.length > maxAttempts).length,
    },
    timing: {
      spanMs: ends.length === 0 ? null : Math.max(...ends) - Math.min(...starts),
      busyMs,
      activeMs,
      overlapSavingMs: busyMs - activeMs,
      timedOutAttempts,
    },
    concurrency: { peak, isWithinBudget: peak <= budgets.parallelism },
  };
}
