// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunRecordSchema,
  SCHEMA_VERSION,
  SpokePathSegmentSchema,
  TestCaseSchema,
  TriageSchema,
  type DefectDraftInput,
} from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';
import { loadAllRunResults } from '../triage-failures.js';
import { wrapUntrustedEvidenceText } from '../untrusted-evidence-text.js';
import { findCasePath } from './cases-render.js';

const MAX_ACTUAL_RESULT_CHARS = 800;

export interface DefectDraftInputOptions {
  readonly runId?: string;
}

/**
 * `qa.defect_draft_input` (P6-08): what the triage spoke drafts defects from. For each failure the
 * run's registered triage called a product bug, the parts of a draft the engine knows (the case's
 * steps and expected result, its requirements, the failure message, where the run happened) and the
 * evidence the triage cited. A failure the triage called flaky, a stale selector, an environment
 * problem or uncertain is not here: it is not a defect to file. Fails with `TRIAGE_NOT_REGISTERED`
 * until the run has a triage.
 */
export async function runDefectDraftInput(
  context: EngineContext,
  options: DefectDraftInputOptions,
): Promise<DefectDraftInput> {
  const runId = SpokePathSegmentSchema.safeParse(options.runId);
  if (!runId.success) {
    throw new QaError('DEFECT_DRAFT_INPUT_USAGE', 'Usage: qa.defect_draft_input with a run id', {
      remediation: 'Pass the id of a run that has a registered triage.',
    });
  }
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const triage = await manifest.readVerified(`artifacts/triage/${runId.data}.json`, TriageSchema);
  if (triage === undefined) {
    throw new QaError('TRIAGE_NOT_REGISTERED', `Run "${runId.data}" has no registered triage`, {
      remediation: 'Triage the run first: qa.triage_input, then qa.triage_add.',
    });
  }

  const results = await loadAllRunResults(store);
  const runRecordPath = `runs/${runId.data}/run.json`;
  const runRecord = (await store.pathExists(runRecordPath))
    ? await store.readJson(runRecordPath, RunRecordSchema)
    : undefined;
  const environment =
    runRecord === undefined
      ? undefined
      : runRecord.identity === undefined
        ? runRecord.baseUrl
        : `${runRecord.baseUrl} (signed in as ${runRecord.identity})`;

  const seeds: DefectDraftInput['seeds'] = [];
  for (const entry of triage.entries.filter((candidate) => candidate.category === 'product-bug')) {
    const failure = results.find(
      (candidate) => candidate.runId === runId.data && candidate.id === entry.resultId,
    )?.failure;
    if (failure === undefined) {
      throw new QaError(
        'DEFECT_DRAFT_RESULT_MISSING',
        `The triage of run "${runId.data}" classifies result "${entry.resultId}", which is no longer a recorded failure`,
        { remediation: 'Triage the run again with qa.triage_input and qa.triage_add.' },
      );
    }
    const testCase = await store.readJson(await findCasePath(store, entry.testCaseId), TestCaseSchema);
    seeds.push({
      resultId: entry.resultId,
      testCaseId: entry.testCaseId,
      caseTitle: testCase.title,
      steps: testCase.steps.map((step) => step.description),
      expectedResult: testCase.expectedResult,
      actualResult: wrapUntrustedEvidenceText(failure.message, MAX_ACTUAL_RESULT_CHARS).text,
      requirementIds: testCase.requirementIds,
      ...(environment === undefined ? {} : { environment }),
      evidencePaths: entry.evidencePaths,
      triageConfidence: entry.confidence,
      triageReasons: entry.reasons,
    });
  }
  return { schemaVersion: SCHEMA_VERSION, runId: runId.data, seeds };
}
