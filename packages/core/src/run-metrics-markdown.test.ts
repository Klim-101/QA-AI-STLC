// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunMetrics } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { renderRunMetricsMarkdown } from './run-metrics-markdown.js';

const METRICS: RunMetrics = {
  schemaVersion: 1,
  runId: 'run-1',
  budgets: { parallelism: 4, spokeTimeoutSeconds: 120, retries: 1 },
  dispatch: {
    tasks: 6,
    attempts: 7,
    okResponses: 5,
    errorResponses: 1,
    unanswered: 1,
    bySpoke: [
      { spokeId: 'explorer', tasks: 1, attempts: 2, retriesUsed: 1 },
      { spokeId: 'test-design', tasks: 5, attempts: 5, retriesUsed: 0 },
    ],
  },
  retries: { used: 1, allowed: 6, tasksAtBudget: 1, tasksOverBudget: 0 },
  timing: { spanMs: 12_340, busyMs: 23_000, activeMs: 12_000, overlapSavingMs: 11_000, timedOutAttempts: 1 },
  concurrency: { peak: 3, isWithinBudget: true },
};

describe('renderRunMetricsMarkdown', () => {
  it('renders every figure of the metrics, with the time in seconds', () => {
    const markdown = renderRunMetricsMarkdown(METRICS);

    expect(markdown).toContain('# Run metrics: run-1');
    expect(markdown).toContain('6 task(s), 7 attempt(s): 5 valid, 1 error, 1 unanswered.');
    expect(markdown).toContain('| explorer | 1 | 2 | 1 |');
    expect(markdown).toContain('| test-design | 5 | 5 | 0 |');
    expect(markdown).toContain(
      '1 used of 6 allowed (agents.retries 1 per task); 1 task(s) used every attempt; 0 recorded over the budget.',
    );
    expect(markdown).toContain('12.3 s from the first dispatch to the last answer.');
    expect(markdown).toContain(
      'take 23.0 s; at least one was running for 12.0 s; running together saved 11.0 s within this run.',
    );
    expect(markdown).toContain('1 attempt(s) timed out (agents.spokeTimeoutSeconds 120).');
    expect(markdown).toContain(
      'At most 3 attempt(s) ran at once, against agents.parallelism 4: within the budget.',
    );
  });

  it('says n/a for a span that does not exist and flags a run over the parallelism budget', () => {
    const markdown = renderRunMetricsMarkdown({
      ...METRICS,
      timing: { ...METRICS.timing, spanMs: null },
      concurrency: { peak: 5, isWithinBudget: false },
    });

    expect(markdown).toContain('n/a from the first dispatch to the last answer.');
    expect(markdown).toContain('against agents.parallelism 4: over the budget.');
  });

  it('says that tokens and cost are not measured', () => {
    expect(renderRunMetricsMarkdown(METRICS)).toContain('Tokens and cost: not measured.');
  });
});
