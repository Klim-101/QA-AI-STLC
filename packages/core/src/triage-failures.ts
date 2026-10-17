// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunResultSchema,
  type RelativePath,
  type RunResult,
  type TriageFailureKind,
  type TriageHistoryEntry,
} from '@qa-ai-stlc/schemas';
import { QaError } from './errors.js';
import type { QaStore } from './qa-store.js';
import { listRunResultPaths } from './run-results.js';

const MAX_HISTORY_ENTRIES = 20;

const NETWORK_FAILURE =
  /net::ERR_|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket hang up|getaddrinfo|fetch failed/iu;
// A locator that matched nothing, as Playwright words it.
const NO_ELEMENT =
  /resolved to 0 elements|element\(s\) not found|strict mode violation|element is not attached/iu;
// An action (a click, a fill) that timed out waiting for its target to appear.
const WAITING_FOR_TARGET = /waiting for (?:getBy|locator|selector)/iu;
const ASSERTION_MISMATCH = /expected[^\n]*\n?[^\n]*received|expect\([^)]*\)\.(?:not\.)?to[A-Z]/iu;

export type FailedRunResult = RunResult & { readonly failure: NonNullable<RunResult['failure']> };

/**
 * What a failure message looks like, read without judging it, so the triage spoke starts from the
 * same hint every time. A network error is not the application's verdict; `locator-not-found` is
 * what a stale selector and a missing feature both look like, so the spoke still has to decide.
 */
export function classifyFailureKind(message: string): TriageFailureKind {
  if (NETWORK_FAILURE.test(message)) {
    return 'network';
  }
  if (NO_ELEMENT.test(message)) {
    return 'locator-not-found';
  }
  // Checked before the wait: an assertion that found its element and saw the wrong value also
  // prints the locator it waited for.
  if (ASSERTION_MISMATCH.test(message)) {
    return 'assertion-mismatch';
  }
  if (WAITING_FOR_TARGET.test(message)) {
    return 'locator-not-found';
  }
  return 'other';
}

export async function loadAllRunResults(store: QaStore): Promise<readonly RunResult[]> {
  const paths = await listRunResultPaths(store);
  return Promise.all(paths.map((path) => store.readJson(path, RunResultSchema)));
}

/**
 * The failed results of one run, ordered by case then result id. Throws `TRIAGE_RUN_NOT_FOUND`
 * when no result at all carries that run id, so a mistyped id is not read as "nothing failed".
 */
export function selectRunFailures(results: readonly RunResult[], runId: string): readonly FailedRunResult[] {
  const ofRun = results.filter((result) => result.runId === runId);
  if (ofRun.length === 0) {
    throw new QaError('TRIAGE_RUN_NOT_FOUND', `No recorded result belongs to run "${runId}"`, {
      remediation: 'Pass the id of a run recorded by qa run or by qa-execute.',
    });
  }
  return ofRun
    .flatMap((result) =>
      result.status === 'failed' && result.failure !== undefined
        ? [{ ...result, failure: result.failure }]
        : [],
    )
    .sort((a, b) => a.testCaseId.localeCompare(b.testCaseId) || a.id.localeCompare(b.id));
}

/** A case's recorded results across runs, oldest first, the most recent `MAX_HISTORY_ENTRIES` of them. */
export function historyOfCase(
  results: readonly RunResult[],
  testCaseId: string,
): readonly TriageHistoryEntry[] {
  return results
    .filter((result) => result.testCaseId === testCaseId)
    .sort((a, b) => new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime())
    .slice(-MAX_HISTORY_ENTRIES)
    .map((result) => ({ runId: result.runId, status: result.status, finishedAt: result.finishedAt }));
}

/** The evidence files `evidence/<run-id>/` holds for a result, by the ids the result lists. */
export async function evidencePathsOfResult(
  store: QaStore,
  result: RunResult,
): Promise<readonly RelativePath[]> {
  const wanted = new Set<string>(result.evidenceIds);
  const files = await store.listFiles(`evidence/${result.runId}`);
  return files
    .filter((path) => wanted.has(path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/u, '')))
    .sort();
}
