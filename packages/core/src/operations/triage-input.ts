// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SCHEMA_VERSION,
  SpokePathSegmentSchema,
  TestCaseSchema,
  type RelativePath,
  type TriageInput,
  type TriageInputFailure,
} from '@qa-ai-stlc/schemas';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { describeEvidence } from '../evidence-description.js';
import { isFlakyHistory } from '../flaky-detection.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';
import {
  classifyFailureKind,
  evidencePathsOfResult,
  historyOfCase,
  loadAllRunResults,
  selectRunFailures,
} from '../triage-failures.js';
import { wrapUntrustedEvidenceText } from '../untrusted-evidence-text.js';

const CASES_DIR: RelativePath = 'artifacts/cases/';
const MAX_FAILURES = 25;
const MAX_FAILURE_MESSAGE_CHARS = 800;

export interface TriageInputOptions {
  readonly runId?: string;
}

/**
 * `qa.triage_input` (P4-05): the input the triage spoke works from, assembled from registered
 * artifacts only: every failed result of the run, its failure message and evidence (each file
 * re-checked against the manifest), the case's history across runs and whether the configured
 * flaky thresholds call that history flaky. Text from the application under test is capped and
 * wrapped in untrusted-data markers (AGENTS.md 12.4).
 */
export async function runTriageInput(
  context: EngineContext,
  options: TriageInputOptions,
): Promise<TriageInput> {
  const runId = SpokePathSegmentSchema.safeParse(options.runId);
  if (!runId.success) {
    throw new QaError('TRIAGE_INPUT_USAGE', 'Usage: qa.triage_input with a run id', {
      remediation: 'Pass the id of a recorded run.',
    });
  }
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const config = await loadConfig(context);
  const results = await loadAllRunResults(store);
  const failed = selectRunFailures(results, runId.data);

  const caseFiles = await store.listFiles(CASES_DIR);
  const titles = new Map(
    (await Promise.all(caseFiles.map((path) => store.readJson(path, TestCaseSchema)))).map((testCase) => [
      testCase.id,
      testCase.title,
    ]),
  );

  const failures: TriageInputFailure[] = [];
  for (const result of failed.slice(0, MAX_FAILURES)) {
    const history = historyOfCase(results, result.testCaseId);
    const title = titles.get(result.testCaseId);
    failures.push({
      resultId: result.id,
      testCaseId: result.testCaseId,
      ...(title === undefined ? {} : { title }),
      testType: result.testType,
      failureMessage: wrapUntrustedEvidenceText(result.failure.message, MAX_FAILURE_MESSAGE_CHARS).text,
      failureKind: classifyFailureKind(result.failure.message),
      evidence: await Promise.all(
        (await evidencePathsOfResult(store, result)).map((path) => describeEvidence(store, manifest, path)),
      ),
      history: [...history],
      isFlaky: isFlakyHistory(
        history.map((entry) => entry.status),
        config.flaky,
      ),
    });
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: runId.data,
    failures,
    omittedFailureCount: Math.max(0, failed.length - MAX_FAILURES),
  };
}
