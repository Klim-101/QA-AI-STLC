// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { RunMetrics } from '@qa-ai-stlc/schemas';

function seconds(milliseconds: number | null): string {
  return milliseconds === null ? 'n/a' : `${(milliseconds / 1000).toFixed(1)} s`;
}

/**
 * The metrics of a run as Markdown, rendered from the JSON (AGENTS.md 2.6) by the engine, so that
 * what a skill or a person reads is the same figures, converted and formatted in one place.
 */
export function renderRunMetricsMarkdown(metrics: RunMetrics): string {
  const { dispatch, retries, timing, concurrency, budgets } = metrics;
  const lines = [
    `# Run metrics: ${metrics.runId}`,
    '',
    '## Dispatch',
    '',
    `${String(dispatch.tasks)} task(s), ${String(dispatch.attempts)} attempt(s): ${String(dispatch.okResponses)} valid, ${String(dispatch.errorResponses)} error, ${String(dispatch.unanswered)} unanswered.`,
    '',
    '| Spoke | Tasks | Attempts | Retried |',
    '| --- | --- | --- | --- |',
    ...dispatch.bySpoke.map(
      (spoke) =>
        `| ${spoke.spokeId} | ${String(spoke.tasks)} | ${String(spoke.attempts)} | ${String(spoke.retriesUsed)} |`,
    ),
    '',
    '## Retries',
    '',
    `${String(retries.used)} used of ${String(retries.allowed)} allowed (agents.retries ${String(budgets.retries)} per task); ${String(retries.tasksAtBudget)} task(s) used every attempt; ${String(retries.tasksOverBudget)} recorded over the budget.`,
    '',
    '## Time',
    '',
    `${seconds(timing.spanMs)} from the first dispatch to the last answer. The answered attempts added up take ${seconds(timing.busyMs)}; at least one was running for ${seconds(timing.activeMs)}; running together saved ${seconds(timing.overlapSavingMs)} within this run. ${String(timing.timedOutAttempts)} attempt(s) timed out (agents.spokeTimeoutSeconds ${String(budgets.spokeTimeoutSeconds)}).`,
    '',
    '## Concurrency',
    '',
    `At most ${String(concurrency.peak)} attempt(s) ran at once, against agents.parallelism ${String(budgets.parallelism)}: ${concurrency.isWithinBudget ? 'within the budget' : 'over the budget'}.`,
    '',
    'Tokens and cost: not measured. The engine reads no host transcript, so it has no true figure for them.',
    '',
  ];
  return lines.join('\n');
}
