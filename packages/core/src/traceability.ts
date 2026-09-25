// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunResultSchema,
  SCHEMA_VERSION,
  ScopeSchema,
  TestCaseSchema,
  type Identifier,
  type RelativePath,
  type RunResultStatus,
  type Scope,
} from '@qa-ai-stlc/schemas';
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
 */
export async function buildTraceabilityMatrix(store: QaStore, clock: Clock): Promise<TraceabilityMatrix> {
  const scope = await loadScope(store);
  const cases = await loadCases(store);
  const latestResultByTestCaseId = await loadLatestResultsByTestCaseId(store);

  const requirements = scope.requirements.map((requirement) => {
    const linkedCases = cases
      .filter((testCase) => testCase.requirementIds.includes(requirement.id))
      .map((testCase) => ({
        testCaseId: testCase.id,
        title: testCase.title,
        latestResult: latestResultByTestCaseId.get(testCase.id),
      }))
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

/** Every `RunResult` ever recorded, keyed by `testCaseId`, keeping only the one with the latest `finishedAt`. */
async function loadLatestResultsByTestCaseId(
  store: QaStore,
): Promise<ReadonlyMap<Identifier, TraceabilityResult>> {
  const resultFiles = await listRunResultPaths(store);
  const latestByTestCaseId = new Map<Identifier, TraceabilityResult>();

  for (const path of resultFiles) {
    const result = await store.readJson(path, RunResultSchema);
    const current = latestByTestCaseId.get(result.testCaseId);
    if (current === undefined || new Date(result.finishedAt) > new Date(current.finishedAt)) {
      latestByTestCaseId.set(result.testCaseId, {
        resultId: result.id,
        runId: result.runId,
        status: result.status,
        finishedAt: result.finishedAt,
        evidenceIds: result.evidenceIds,
      });
    }
  }

  return latestByTestCaseId;
}
