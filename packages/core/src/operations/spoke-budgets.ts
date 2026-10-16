// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SpokeInputRecordSchema, type AgentsConfig } from '@qa-ai-stlc/schemas';
import { QaError } from '../errors.js';
import type { QaStore } from '../qa-store.js';

const INPUT_FILE = 'input.json';
const OUTPUT_FILE = 'output.json';
// Only a file in an attempt folder is a dispatch; anything else under a task is not the engine's.
const ATTEMPT_INPUT = /[/]attempt-[1-9][0-9]*[/]input\.json$/u;

export interface SpokeBudgets {
  readonly parallelism: number;
  readonly timeoutMs: number;
  /** The first attempt plus `agents.retries` re-dispatches. */
  readonly maxAttempts: number;
}

export function toSpokeBudgets(agents: AgentsConfig): SpokeBudgets {
  return {
    parallelism: agents.parallelism,
    timeoutMs: agents.spokeTimeoutSeconds * 1000,
    maxAttempts: agents.retries + 1,
  };
}

function isExpired(recordedAt: string, now: Date, timeoutMs: number): boolean {
  return now.getTime() - Date.parse(recordedAt) > timeoutMs;
}

/**
 * Attempts of a run that have an input and no output yet and are still inside the spoke timeout. An
 * attempt past its timeout no longer holds a slot: a spoke that never answered cannot block the
 * hub for good.
 */
async function countInFlightAttempts(
  store: QaStore,
  runId: string,
  now: Date,
  timeoutMs: number,
): Promise<number> {
  const paths = await store.listFiles(`runs/${runId}/spokes`);
  const unanswered = paths.filter(
    (path) =>
      ATTEMPT_INPUT.test(path) && !paths.includes(`${path.slice(0, -INPUT_FILE.length)}${OUTPUT_FILE}`),
  );
  const records = await Promise.all(unanswered.map((path) => store.readJson(path, SpokeInputRecordSchema)));
  return records.filter((record) => !isExpired(record.recordedAt, now, timeoutMs)).length;
}

/** Refuses a dispatch while the configured number of spokes are already running in the run. */
export async function assertParallelismAvailable(
  store: QaStore,
  runId: string,
  now: Date,
  budgets: SpokeBudgets,
): Promise<void> {
  const inFlight = await countInFlightAttempts(store, runId, now, budgets.timeoutMs);
  if (inFlight >= budgets.parallelism) {
    throw new QaError(
      'SPOKE_PARALLELISM_EXCEEDED',
      `${String(inFlight)} spoke(s) are already running in run "${runId}" and agents.parallelism is ${String(budgets.parallelism)}`,
      {
        remediation:
          'Record the output of a running spoke (qa.spoke_record_output) before dispatching another, or raise agents.parallelism in .qa/config.yaml.',
      },
    );
  }
}

/** Refuses an output that arrives after the spoke's time ran out; the task's next attempt is a retry. */
export function assertWithinTimeout(
  recordedAt: string,
  now: Date,
  budgets: SpokeBudgets,
  taskId: string,
): void {
  if (isExpired(recordedAt, now, budgets.timeoutMs)) {
    throw new QaError(
      'SPOKE_TIMEOUT_EXCEEDED',
      `The spoke for task "${taskId}" answered after agents.spokeTimeoutSeconds (${String(budgets.timeoutMs / 1000)})`,
      {
        remediation:
          'Treat the attempt as failed and dispatch the task again (the next attempt), or raise agents.spokeTimeoutSeconds in .qa/config.yaml.',
      },
    );
  }
}
