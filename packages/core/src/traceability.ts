// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunResultSchema,
  SCHEMA_VERSION,
  ScopeSchema,
  TestCaseSchema,
  type FlakyDetectionConfig,
  type Identifier,
  type RelativePath,
  type RunResultStatus,
  type Scope,
} from '@qa-ai-stlc/schemas';
import { isFlakyHistory } from './flaky-detection.js';
import type { Clock } from './ports/clock.js';
import type { QaStore } from './qa-store.js';
import { listRunResultPaths } from './run-results.js';

const SCOPE_PATH: RelativePath = 'artifacts/scope.json';
const CASES_DIR: RelativePath = 'artifacts/cases';

export interface TraceabilityResult {
  readonly resultId: Identifier;
  readonly runId: Identifier;
  readonly status: RunResultStatus;
  readonly finishedAt: string;
  readonly evidenceIds: readonly Identifier[];
}

export interface TraceabilityCase {
  readonly testCaseId: Identifier;
  readonly title: string;
  /** `undefined` when no run has ever produced a result for this case yet. */
  readonly latestResult: TraceabilityResult | undefined;
  /** Set when the case's status flips within its recent history (P3-10, `flaky` config). */
  readonly flaky: boolean;
}

export interface TraceabilityRequirement {
  readonly requirementId: Identifier;
  readonly title: string;
  /** Empty when no registered case links to this requirement yet — a real coverage gap to show. */
  readonly cases: readonly TraceabilityCase[];
}

export interface TraceabilityMatrix {
  readonly generatedAt: string;
  readonly requirements: readonly TraceabilityRequirement[];
}

/**
 * Builds the requirement → case → result → evidence traceability matrix (P3-08, ADR-002) fresh
 * from the current `.qa/` store: every requirement in `scope.json`, every case that links to it
 * (`TestCase.requirementIds`), and each case's most recent run result, by `finishedAt`, across
 * every run recorded under `runs/**` — not just the run being reported on, so a case last run
 * yesterday still shows its real last-known status instead of disappearing from today's report.
 * Each case's `flaky` flag (P3-10) is computed from that same history against `flakyConfig`.
 */
export async function buildTraceabilityMatrix(
  store: QaStore,
  clock: Clock,
  flakyConfig: FlakyDetectionConfig,
): Promise<TraceabilityMatrix> {
  const scope = await loadScope(store);
  const cases = await loadCases(store);
  const resultHistoryByTestCaseId = await loadResultHistoryByTestCaseId(store);

  const requirements = scope.requirements.map((requirement) => {
    const linkedCases = cases
      .filter((testCase) => testCase.requirementIds.includes(requirement.id))
      .map((testCase) => {
        const history = resultHistoryByTestCaseId.get(testCase.id) ?? [];
        return {
          testCaseId: testCase.id,
          title: testCase.title,
          latestResult: history.at(-1),
          flaky: isFlakyHistory(
            history.map((result) => result.status),
            flakyConfig,
          ),
        };
      })
      .sort((a, b) => a.testCaseId.localeCompare(b.testCaseId));

    return { requirementId: requirement.id, title: requirement.title, cases: linkedCases };
  });

  return { generatedAt: clock.now().toISOString(), requirements };
}

/** A project with no `qa scope` run yet has zero known requirements, not a missing-file error. */
async function loadScope(store: QaStore): Promise<Scope> {
  const exists = await store.pathExists(SCOPE_PATH);
  if (!exists) {
    return { schemaVersion: SCHEMA_VERSION, generatedAt: new Date(0).toISOString(), requirements: [] };
  }
  return store.readJson(SCOPE_PATH, ScopeSchema);
}

async function loadCases(store: QaStore) {
  const caseFiles = await store.listFiles(CASES_DIR);
  const cases = await Promise.all(caseFiles.map((path) => store.readJson(path, TestCaseSchema)));
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

/** Every `RunResult` ever recorded, keyed by `testCaseId`, sorted oldest first by `finishedAt`. */
async function loadResultHistoryByTestCaseId(
  store: QaStore,
): Promise<ReadonlyMap<Identifier, readonly TraceabilityResult[]>> {
  const resultFiles = await listRunResultPaths(store);
  const historyByTestCaseId = new Map<Identifier, TraceabilityResult[]>();

  for (const path of resultFiles) {
    const result = await store.readJson(path, RunResultSchema);
    const history = historyByTestCaseId.get(result.testCaseId) ?? [];
    history.push({
      resultId: result.id,
      runId: result.runId,
      status: result.status,
      finishedAt: result.finishedAt,
      evidenceIds: result.evidenceIds,
    });
    historyByTestCaseId.set(result.testCaseId, history);
  }

  for (const history of historyByTestCaseId.values()) {
    history.sort((a, b) => new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime());
  }

  return historyByTestCaseId;
}
