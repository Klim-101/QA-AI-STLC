// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunResultSchema,
  SCHEMA_VERSION,
  TestCaseSchema,
  type RcaInput,
  type RcaInputEvidence,
  type RcaInputResult,
  type RelativePath,
  type RunResult,
} from '@qa-ai-stlc/schemas';
import { ApprovalLedgerStore } from '../approval-ledger-store.js';
import { loadConfig } from '../config-loader.js';
import { DefectStore } from '../defect-store.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { hashBytes } from '../hash.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';
import { RcaStore, assertDefectAccepted } from '../rca-store.js';
import { listRunResultPaths } from '../run-results.js';
import { wrapUntrustedEvidenceText } from '../untrusted-evidence-text.js';

const CASES_DIR: RelativePath = 'artifacts/cases/';
const MAX_RESULTS = 20;
const MAX_FAILURE_MESSAGE_CHARS = 500;
const MAX_EVIDENCE_EXCERPT_CHARS = 2_000;
// Evidence worth showing as text; screenshots, traces and videos are referenced by path and hash only.
const TEXT_EVIDENCE_EXTENSIONS: ReadonlySet<string> = new Set(['json', 'log', 'txt']);

export interface RcaInputOptions {
  readonly defectId?: string;
}

/**
 * `qa.rca_input` (P6-15): the input the `qa-rca` spoke works from, assembled from registered
 * artifacts only — the accepted defect, the cases covering its requirements, their run history and
 * the defect's evidence (each file re-checked against the manifest, so a hand-edited file is
 * refused, AGENTS.md 12.7). Text that came from the application under test (failure messages,
 * evidence excerpts) is capped and wrapped in untrusted-data markers. No defect, no RCA: the defect
 * must be accepted.
 */
export async function runRcaInput(context: EngineContext, options: RcaInputOptions): Promise<RcaInput> {
  if (options.defectId === undefined) {
    throw new QaError('RCA_INPUT_USAGE', 'Usage: qa.rca_input with a defect id', {
      remediation: 'Pass the id of an accepted defect.',
    });
  }
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const ledger = new ApprovalLedgerStore({ store, manifest });
  const defects = new DefectStore({ store, manifest, ledger });
  const rcas = new RcaStore({ store, manifest, ledger, defects });

  const defectSha256 = assertDefectAccepted(
    options.defectId,
    await rcas.currentAcceptedDefectSha256(options.defectId),
  );
  const defect = await defects.read(options.defectId);

  const caseFiles = await store.listFiles(CASES_DIR);
  const allCases = await Promise.all(caseFiles.map((path) => store.readJson(path, TestCaseSchema)));
  const cases = allCases
    .filter((testCase) => testCase.requirementIds.some((id) => defect.requirementIds.includes(id)))
    .sort((a, b) => a.id.localeCompare(b.id));

  const evidence: RcaInputEvidence[] = [];
  for (const path of defect.evidencePaths) {
    evidence.push(await describeEvidence(store, manifest, path));
  }

  const { results, omittedResultCount } = await loadResultHistory(
    store,
    new Set(cases.map((testCase) => testCase.id)),
    new Set(defect.evidencePaths.map(runIdOfEvidencePath)),
  );

  const config = await loadConfig(context);
  return {
    schemaVersion: SCHEMA_VERSION,
    defect,
    defectSha256,
    cases: cases.map((testCase) => ({
      id: testCase.id,
      title: testCase.title,
      feature: testCase.feature,
      testType: testCase.testType,
      requirementIds: testCase.requirementIds,
    })),
    results,
    omittedResultCount,
    evidence,
    source:
      config.source === undefined
        ? { isConfigured: false }
        : { isConfigured: true, path: config.source.path },
  };
}

/** `evidence/<runId>/<id>.<ext>`: the run an evidence file was registered under. */
function runIdOfEvidencePath(path: RelativePath): string {
  return path.split('/')[1] ?? '';
}

async function describeEvidence(
  store: QaStore,
  manifest: ManifestStore,
  path: RelativePath,
): Promise<RcaInputEvidence> {
  const bytes = await store.readBytes(path);
  if (!(await manifest.verifyContent(path, bytes))) {
    throw new QaError('ARTIFACT_HASH_MISMATCH', `"${path}" does not match its registered hash`, {
      remediation: 'The evidence changed outside the engine; re-run the case to register fresh evidence.',
    });
  }
  const base = { path, sha256: hashBytes(bytes), sizeBytes: bytes.length };
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (!TEXT_EVIDENCE_EXTENSIONS.has(extension)) {
    return { ...base, isTruncated: false };
  }
  const excerpt = wrapUntrustedEvidenceText(Buffer.from(bytes).toString('utf-8'), MAX_EVIDENCE_EXCERPT_CHARS);
  return { ...base, excerpt: excerpt.text, isTruncated: excerpt.isTruncated };
}

async function loadResultHistory(
  store: QaStore,
  caseIds: ReadonlySet<string>,
  runIds: ReadonlySet<string>,
): Promise<{ readonly results: RcaInputResult[]; readonly omittedResultCount: number }> {
  const matching: RunResult[] = [];
  for (const path of await listRunResultPaths(store)) {
    const result = await store.readJson(path, RunResultSchema);
    if (caseIds.has(result.testCaseId) || runIds.has(result.runId)) {
      matching.push(result);
    }
  }
  matching.sort((a, b) => new Date(b.finishedAt).getTime() - new Date(a.finishedAt).getTime());
  return {
    results: matching.slice(0, MAX_RESULTS).map((result) => ({
      resultId: result.id,
      runId: result.runId,
      testCaseId: result.testCaseId,
      status: result.status,
      finishedAt: result.finishedAt,
      ...(result.failure === undefined
        ? {}
        : {
            failureMessage: wrapUntrustedEvidenceText(result.failure.message, MAX_FAILURE_MESSAGE_CHARS).text,
          }),
    })),
    omittedResultCount: Math.max(0, matching.length - MAX_RESULTS),
  };
}
