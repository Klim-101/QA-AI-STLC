// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { RunRecordSchema, type Identifier, type RelativePath, type RunRecord } from '@qa-ai-stlc/schemas';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { QaStore } from '../qa-store.js';
import { renderHtmlArtifact } from '../render/html-registry.js';
import { renderMarkdownArtifact } from '../render/markdown-registry.js';
import { buildTraceabilityMatrix } from '../traceability.js';

const RUNS_DIR: RelativePath = 'runs';

export type ReportFormat = 'markdown' | 'html';

export interface ReportOptions {
  /** A specific run id to report on. Defaults to the most recently started run. */
  readonly runId?: string;
  readonly format?: ReportFormat;
}

export interface ReportResult {
  readonly runId: Identifier;
  readonly runRecordPath: RelativePath;
  readonly format: ReportFormat;
  readonly runSummary: string;
  readonly traceabilityMatrix: string;
}

/**
 * `qa report` / MCP `qa.report` (P3-08, ADR-002): renders a run summary and the current
 * requirement → case → result → evidence traceability matrix from the canonical JSON already
 * recorded under `.qa/` — no hand-written report path exists, every byte comes from a registered
 * artifact through the shared renderer registries (`markdown-registry.ts` / `html-registry.ts`).
 * The traceability matrix always reflects every run ever recorded, not just `runId`'s own results
 * (`buildTraceabilityMatrix`'s own doc comment); `runId` selects only which run's own summary is
 * rendered alongside it.
 */
export async function runReport(context: EngineContext, options: ReportOptions): Promise<ReportResult> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const format = options.format ?? 'markdown';

  const runId = options.runId ?? (await findMostRecentRunId(store));
  if (runId === undefined) {
    throw new QaError('REPORT_NO_RUNS', 'No runs are recorded yet under .qa/runs/.', {
      remediation: 'Run `qa run` at least once before `qa report`.',
    });
  }

  const runRecordPath: RelativePath = `${RUNS_DIR}/${runId}/run.json`;
  if (!(await store.pathExists(runRecordPath))) {
    throw new QaError('REPORT_RUN_NOT_FOUND', `No recorded run with id "${runId}".`, {
      remediation: 'Check the id against the run directories registered under .qa/runs/.',
    });
  }
  const runRecord = await store.readJson(runRecordPath, RunRecordSchema);

  const matrix = await buildTraceabilityMatrix(store, context.clock);

  const runSummary =
    format === 'markdown'
      ? renderMarkdownArtifact('run-summary', runRecord)
      : renderHtmlArtifact('run-summary', runRecord);
  const traceabilityMatrix =
    format === 'markdown'
      ? renderMarkdownArtifact('traceability-matrix', matrix)
      : renderHtmlArtifact('traceability-matrix', matrix);

  return { runId, runRecordPath, format, runSummary, traceabilityMatrix };
}

/** The run whose `RunRecord.startedAt` is latest, or `undefined` when no run has been recorded yet. */
async function findMostRecentRunId(store: QaStore): Promise<Identifier | undefined> {
  const runRecordPaths = (await store.listFiles(RUNS_DIR)).filter((path) => path.endsWith('/run.json'));
  let latest: RunRecord | undefined;
  for (const path of runRecordPaths) {
    const record = await store.readJson(path, RunRecordSchema);
    if (latest === undefined || new Date(record.startedAt) > new Date(latest.startedAt)) {
      latest = record;
    }
  }
  return latest?.id;
}
