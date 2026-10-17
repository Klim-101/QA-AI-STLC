// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { RunMetricsSchema } from './run-metrics.js';

const METRICS = {
  runId: 'run-1',
  budgets: { parallelism: 2, spokeTimeoutSeconds: 60, retries: 1 },
  dispatch: { tasks: 1, attempts: 1, okResponses: 1, errorResponses: 0, unanswered: 0, bySpoke: [] },
  retries: { used: 0, allowed: 1, tasksAtBudget: 0, tasksOverBudget: 0 },
  timing: { spanMs: null, busyMs: 0, activeMs: 0, overlapSavingMs: 0, timedOutAttempts: 0 },
  concurrency: { peak: 1, isWithinBudget: true },
};

describe('RunMetricsSchema', () => {
  it('accepts metrics and defaults the schema version', () => {
    expect(RunMetricsSchema.parse(METRICS).schemaVersion).toBe(1);
  });

  it('rejects a run id that could name a path, and a negative count', () => {
    expect(RunMetricsSchema.safeParse({ ...METRICS, runId: '../x' }).success).toBe(false);
    expect(
      RunMetricsSchema.safeParse({ ...METRICS, retries: { ...METRICS.retries, used: -1 } }).success,
    ).toBe(false);
  });

  it('has no field for tokens or cost', () => {
    expect(Object.keys(RunMetricsSchema.shape).filter((key) => /token|cost/iu.test(key))).toEqual([]);
  });
});
