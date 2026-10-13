// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunResultSchema,
  RunResultStatusSchema,
  type Identifier,
  type RunResult,
  type RunResultStatus,
  type TestType,
} from '@qa-ai-stlc/schemas';
import type { QaStore } from './qa-store.js';
import { listInteractiveResultPaths } from './run-results.js';

const FAILURE_MESSAGE_LIMIT = 200;

export interface InteractiveResultRow {
  readonly testCaseId: Identifier;
  readonly testType: TestType;
  /** The status of the case's latest result; a rerun replaces it, earlier ones stay in `resultCount`. */
  readonly status: RunResultStatus;
  readonly finishedAt: string;
  readonly runId: Identifier;
  readonly evidenceCount: number;
  readonly resultCount: number;
  /** The first line of the failure message, capped, present only when the latest result has one. */
  readonly failureMessage?: string;
}

export interface InteractiveResultsSummary {
  /** Set when the summary covers one live-execution run instead of every recorded one. */
  readonly runId?: Identifier;
  readonly rows: readonly InteractiveResultRow[];
  /** Exhaustive over every status, counted over the latest result of each case. */
  readonly counts: Readonly<Record<RunResultStatus, number>>;
}

/**
 * Summarises the results `qa-execute` registered (P3-14): one row per case, taken from its latest
 * result, so a case run twice is counted once. Results come from the canonical JSON under `runs/`
 * only, never from an agent's narration (AGENTS.md 12.5). `undefined` when none exist.
 */
export async function buildInteractiveResultsSummary(
  store: QaStore,
  options: { readonly runId?: Identifier } = {},
): Promise<InteractiveResultsSummary | undefined> {
  const paths = await listInteractiveResultPaths(store);
  const results = await Promise.all(paths.map((path) => store.readJson(path, RunResultSchema)));
  const selected = options.runId === undefined ? results : results.filter((r) => r.runId === options.runId);
  if (selected.length === 0) {
    return undefined;
  }

  const latestByTestCaseId = new Map<Identifier, { latest: RunResult; resultCount: number }>();
  for (const result of selected) {
    const entry = latestByTestCaseId.get(result.testCaseId);
    if (entry === undefined) {
      latestByTestCaseId.set(result.testCaseId, { latest: result, resultCount: 1 });
      continue;
    }
    entry.resultCount += 1;
    if (new Date(result.finishedAt) > new Date(entry.latest.finishedAt)) {
      entry.latest = result;
    }
  }

  const rows = [...latestByTestCaseId.values()]
    .map(({ latest, resultCount }) => toRow(latest, resultCount))
    .sort((a, b) => a.testCaseId.localeCompare(b.testCaseId));

  const counts = Object.fromEntries(RunResultStatusSchema.options.map((status) => [status, 0])) as Record<
    RunResultStatus,
    number
  >;
  for (const row of rows) {
    counts[row.status] += 1;
  }

  return { ...(options.runId === undefined ? {} : { runId: options.runId }), rows, counts };
}

function toRow(latest: RunResult, resultCount: number): InteractiveResultRow {
  const failureMessage = latest.failure === undefined ? undefined : firstLine(latest.failure.message);
  return {
    testCaseId: latest.testCaseId,
    testType: latest.testType,
    status: latest.status,
    finishedAt: latest.finishedAt,
    runId: latest.runId,
    evidenceCount: latest.evidenceIds.length,
    resultCount,
    ...(failureMessage === undefined ? {} : { failureMessage }),
  };
}

function firstLine(message: string): string {
  const line = message.replace(/\n[\s\S]*$/, '');
  return line.length > FAILURE_MESSAGE_LIMIT ? `${line.slice(0, FAILURE_MESSAGE_LIMIT)}…` : line;
}
