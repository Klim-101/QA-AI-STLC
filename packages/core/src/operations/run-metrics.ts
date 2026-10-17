// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SpokePathSegmentSchema, type RunMetrics } from '@qa-ai-stlc/schemas';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { QaStore } from '../qa-store.js';
import { computeRunMetrics } from '../run-metrics.js';
import { latestSpokeRunId, readSpokeAttempts } from '../spoke-records.js';

export interface RunMetricsOptions {
  /** The run the hub recorded its spokes under; the run with the newest records when absent. */
  readonly runId?: string;
}

/**
 * `qa.run_metrics` / `qa metrics` (P4-10): how a run of the agent layer was carried out, read from
 * the spoke I/O store and the `agents` budgets of the configuration: dispatch and retry counts
 * against the budget, wall-clock and busy time, the overlap parallel dispatch saved, and the most
 * attempts running at once. It has no token count: the engine reads no host transcript.
 */
export async function runRunMetrics(context: EngineContext, options: RunMetricsOptions): Promise<RunMetrics> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const { agents } = await loadConfig(context);
  const requested = options.runId === undefined ? undefined : SpokePathSegmentSchema.safeParse(options.runId);
  if (requested !== undefined && !requested.success) {
    throw new QaError('RUN_METRICS_RUN_INVALID', `"${String(options.runId)}" cannot name a run`, {
      remediation: 'Pass the run id the hub gave qa.spoke_record_input.',
    });
  }
  const attempts = await readSpokeAttempts(store, requested?.data);
  const runId = requested?.data ?? latestSpokeRunId(attempts);
  if (runId === undefined || attempts.length === 0) {
    throw new QaError('RUN_METRICS_NO_SPOKES', 'No spoke records were found for a run', {
      remediation:
        'Metrics come from the spoke I/O store: record dispatches with qa.spoke_record_input first.',
    });
  }
  return computeRunMetrics(
    runId,
    attempts.filter((attempt) => attempt.runId === runId),
    agents,
    context.clock.now().getTime(),
  );
}
