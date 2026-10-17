// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { SpokeInputRecordSchema, SpokeOutputRecordSchema } from '@qa-ai-stlc/schemas';
import type { QaStore } from './qa-store.js';

const SPOKE_INPUT_PATH = /^runs\/([^/]+)\/spokes\/[^/]+\/[^/]+\/attempt-[1-9][0-9]*\/input\.json$/u;

/** One attempt of a spoke task as the spoke I/O store holds it. */
export interface SpokeAttempt {
  readonly runId: string;
  readonly spokeId: string;
  readonly taskId: string;
  readonly attempt: number;
  readonly inputAt: string;
  readonly outputAt?: string;
  readonly status?: 'ok' | 'error';
}

/**
 * Every attempt recorded under `runs/<run-id>/spokes/` (P4-01), or those of one run, ordered by
 * run, spoke, task and attempt. An attempt with no output file was dispatched and never answered.
 */
export async function readSpokeAttempts(store: QaStore, runId?: string): Promise<readonly SpokeAttempt[]> {
  const inputPaths = (await store.listFiles(runId === undefined ? 'runs' : `runs/${runId}`)).filter((path) =>
    SPOKE_INPUT_PATH.test(path),
  );
  const attempts = await Promise.all(
    inputPaths.map(async (inputPath): Promise<SpokeAttempt> => {
      const input = await store.readJson(inputPath, SpokeInputRecordSchema);
      const base = {
        runId: input.runId,
        spokeId: input.spokeId,
        taskId: input.taskId,
        attempt: input.attempt,
        inputAt: input.recordedAt,
      };
      const outputPath = `${inputPath.slice(0, -'input.json'.length)}output.json`;
      if (!(await store.pathExists(outputPath))) {
        return base;
      }
      const output = await store.readJson(outputPath, SpokeOutputRecordSchema);
      return { ...base, outputAt: output.recordedAt, status: output.result.status };
    }),
  );
  return attempts.toSorted(
    (a, b) =>
      a.runId.localeCompare(b.runId) ||
      a.spokeId.localeCompare(b.spokeId) ||
      a.taskId.localeCompare(b.taskId) ||
      a.attempt - b.attempt,
  );
}

/** The run whose spoke records were written last, or `undefined` when no run has any. */
export function latestSpokeRunId(attempts: readonly SpokeAttempt[]): string | undefined {
  const latest = attempts.toSorted(
    (a, b) => new Date(b.inputAt).getTime() - new Date(a.inputAt).getTime(),
  )[0];
  return latest?.runId;
}
