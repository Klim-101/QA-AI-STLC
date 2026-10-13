// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { RunRecordSchema, type Identifier, type RelativePath, type RunRecord } from '@qa-ai-stlc/schemas';
import { buildA11yConformanceReport, type A11yConformanceReport } from '../a11y-conformance.js';
import { listA11yScans } from '../a11y-scan-store.js';
import { loadConfig } from '../config-loader.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { buildInteractiveResultsSummary } from '../interactive-results-summary.js';
import { QaStore } from '../qa-store.js';
import { renderHtmlArtifact } from '../render/html-registry.js';
import { renderMarkdownArtifact } from '../render/markdown-registry.js';
import { buildTraceabilityMatrix } from '../traceability.js';

const RUNS_DIR: RelativePath = 'runs';

export type ReportFormat = 'markdown' | 'html';

export interface ReportOptions {
  /**
   * A specific run id to report on: a `qa run` record, or a live execution run. Defaults to the
   * most recently started `qa run` record plus every live execution result.
   */
  readonly runId?: string;
  readonly format?: ReportFormat;
}

export interface ReportResult {
  /** Set only when a `qa run` record is reported. */
  readonly runId?: Identifier;
  readonly runRecordPath?: RelativePath;
  readonly format: ReportFormat;
  /** The summary of a `qa run` record; absent when only live execution results exist. */
  readonly runSummary?: string;
  /** The results registered by live case execution (`qa-execute`); absent when there are none. */
  readonly interactiveSummary?: string;
  readonly traceabilityMatrix: string;
  /** Rendered accessibility conformance section; present only when accessibility testing is in scope. */
  readonly a11yConformance?: string;
}

/**
 * `qa report` / MCP `qa.report` (P3-08, ADR-002): renders a run summary and the current
 * requirement → case → result → evidence traceability matrix from the canonical JSON already
 * recorded under `.qa/` — no hand-written report path exists, every byte comes from a registered
 * artifact through the shared renderer registries (`markdown-registry.ts` / `html-registry.ts`).
 * The traceability matrix always reflects every result ever recorded, not just `runId`'s own
 * (`buildTraceabilityMatrix`'s own doc comment); `runId` selects only which run's own summary is
 * rendered alongside it.
 *
 * Two kinds of run exist: a `qa run` record (`runs/<run-id>/run.json`) and the results live case
 * execution registered (`runs/<case-id>/<result-id>.json`), which have no record. Each is reported
 * under its own summary, so a session that only executed cases still gets a report.
 */
export async function runReport(context: EngineContext, options: ReportOptions): Promise<ReportResult> {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const format = options.format ?? 'markdown';

  const runRecord = await readRunRecord(store, options.runId ?? (await findMostRecentRunId(store)));
  // A `runId` that names a `qa run` record asks for that run only; one that names no record may be a
  // live execution run, so the live summary is narrowed to it.
  const interactiveSummary =
    options.runId !== undefined && runRecord !== undefined
      ? undefined
      : await buildInteractiveResultsSummary(
          store,
          options.runId === undefined ? {} : { runId: options.runId },
        );

  if (runRecord === undefined && interactiveSummary === undefined) {
    throw options.runId === undefined
      ? new QaError('REPORT_NO_RUNS', 'No runs or live execution results are recorded yet under .qa/runs/.', {
          remediation:
            'Run `qa run` at least once, or register a case result with `qa.case_result_register`, before `qa report`.',
        })
      : new QaError('REPORT_RUN_NOT_FOUND', `No recorded run with id "${options.runId}".`, {
          remediation: 'Check the id against the run directories registered under .qa/runs/.',
        });
  }

  const config = await loadConfig(context);
  const matrix = await buildTraceabilityMatrix(store, context.clock, config.flaky);

  const traceabilityMatrix =
    format === 'markdown'
      ? renderMarkdownArtifact('traceability-matrix', matrix)
      : renderHtmlArtifact('traceability-matrix', matrix);
  const a11yConformance =
    config.testing.a11y === 'in-scope'
      ? renderA11yConformance(buildA11yConformanceReport(config.a11y, await listA11yScans(store)), format)
      : undefined;

  return {
    ...(runRecord === undefined
      ? {}
      : {
          runId: runRecord.id,
          runRecordPath: runRecordPath(runRecord.id),
          runSummary:
            format === 'markdown'
              ? renderMarkdownArtifact('run-summary', runRecord)
              : renderHtmlArtifact('run-summary', runRecord),
        }),
    format,
    ...(interactiveSummary === undefined
      ? {}
      : {
          interactiveSummary:
            format === 'markdown'
              ? renderMarkdownArtifact('interactive-results-summary', interactiveSummary)
              : renderHtmlArtifact('interactive-results-summary', interactiveSummary),
        }),
    traceabilityMatrix,
    ...(a11yConformance === undefined ? {} : { a11yConformance }),
  };
}

function runRecordPath(runId: Identifier): RelativePath {
  return `${RUNS_DIR}/${runId}/run.json`;
}

/** The `qa run` record of `runId`, or `undefined` when `runId` is unset or names no record. */
async function readRunRecord(store: QaStore, runId: Identifier | undefined): Promise<RunRecord | undefined> {
  if (runId === undefined || !(await store.pathExists(runRecordPath(runId)))) {
    return undefined;
  }
  return store.readJson(runRecordPath(runId), RunRecordSchema);
}

function renderA11yConformance(report: A11yConformanceReport, format: ReportFormat): string {
  return format === 'markdown'
    ? renderMarkdownArtifact('a11y-conformance', report)
    : renderHtmlArtifact('a11y-conformance', report);
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
