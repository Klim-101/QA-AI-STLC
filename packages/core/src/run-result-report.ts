// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  RunRecordSchema,
  type A11yConformanceLevel,
  type A11yWcagVersion,
  type Config,
  type DefectDraft,
  type DefectSeverityProposal,
  type DefectStatus,
  type Identifier,
  type Rca,
  type RelativePath,
  type RunResultStatus,
  type TestType,
} from '@qa-ai-stlc/schemas';
import { buildA11yConformanceReport, type CriterionConformanceStatus } from './a11y-conformance.js';
import { listA11yScans } from './a11y-scan-store.js';
import { ApprovalLedgerStore } from './approval-ledger-store.js';
import { DEFECTS_DIR, DefectStore } from './defect-store.js';
import type { Clock } from './ports/clock.js';
import { buildInteractiveResultsSummary, type InteractiveResultRow } from './interactive-results-summary.js';
import { ManifestStore } from './manifest-store.js';
import type { QaStore } from './qa-store.js';
import { RcaStore } from './rca-store.js';

export interface SpecRunRow {
  readonly runId: Identifier;
  readonly testType: TestType;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly specFileCount: number;
  readonly counts: Readonly<Record<RunResultStatus, number>>;
}

export interface AccessibilitySummary {
  readonly wcagVersion: A11yWcagVersion;
  readonly level: A11yConformanceLevel;
  readonly scanCount: number;
  readonly counts: Readonly<Record<CriterionConformanceStatus, number>>;
}

export interface DefectRow {
  readonly id: Identifier;
  readonly title: string;
  readonly severityProposal: DefectSeverityProposal;
  readonly category: DefectDraft['category'];
  readonly status: DefectStatus;
}

export interface ApprovedRca {
  readonly defectId: Identifier;
  readonly facts: Rca['facts'];
  readonly hypotheses: Rca['hypotheses'];
  readonly remediation: Rca['remediation'];
}

/** Everything a run-result report shows; each list is empty when its section has nothing to say. */
export interface RunResultReport {
  readonly cases: readonly InteractiveResultRow[];
  /** Counted over the latest result of each case; exhaustive over every status. */
  readonly caseCounts: Readonly<Record<RunResultStatus, number>> | undefined;
  readonly specRuns: readonly SpecRunRow[];
  readonly accessibility: AccessibilitySummary | undefined;
  readonly defects: readonly DefectRow[];
  readonly approvedRcas: readonly ApprovedRca[];
  /** RCAs not approved (or no longer approved), counted but not shown as findings. */
  readonly unapprovedRcaCount: number;
}

export interface RunResultReportInput {
  readonly store: QaStore;
  readonly clock: Clock;
  readonly config: Config;
}

/**
 * Collects the data of a run-result report from the canonical JSON under `.qa/` (AGENTS.md 12.5):
 * latest result per live-executed case, `qa run` records, accessibility conformance counts,
 * defects and RCAs. A defect or RCA is shown with the status its approval ledger supports, so a
 * hand-edited "accepted" reads back as a draft. Evidence is only counted, never read.
 */
export async function buildRunResultReport(input: RunResultReportInput): Promise<RunResultReport> {
  const { store, config } = input;
  const interactive = await buildInteractiveResultsSummary(store);
  const manifest = new ManifestStore({ store, clock: input.clock });
  const ledger = new ApprovalLedgerStore({ store, manifest });
  const defects = new DefectStore({ store, manifest, ledger });
  const rcas = new RcaStore({ store, manifest, ledger, defects });

  const defectRows: DefectRow[] = [];
  for (const path of (await store.listFiles(DEFECTS_DIR)).filter((file) => file.endsWith('.json'))) {
    const id = path.slice(path.lastIndexOf('/') + 1, -'.json'.length);
    const draft = await defects.read(id);
    defectRows.push({
      id: draft.id,
      title: draft.title,
      severityProposal: draft.severityProposal,
      category: draft.category,
      status: await defects.resolveStatus(draft),
    });
  }

  const approvedRcas: ApprovedRca[] = [];
  let unapprovedRcaCount = 0;
  for (const path of (await store.listFiles('artifacts/rca')).filter((file) => file.endsWith('.json'))) {
    const rca = await rcas.read(path.slice(path.lastIndexOf('/') + 1, -'.json'.length));
    if ((await rcas.resolveStatus(rca)) === 'approved') {
      approvedRcas.push({
        defectId: rca.defectId,
        facts: rca.facts,
        hypotheses: rca.hypotheses,
        remediation: rca.remediation,
      });
    } else {
      unapprovedRcaCount += 1;
    }
  }

  const specRuns: SpecRunRow[] = [];
  for (const path of await listRunRecordPaths(store)) {
    const record = await store.readJson(path, RunRecordSchema);
    specRuns.push({
      runId: record.id,
      testType: record.testType,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      specFileCount: record.specFiles.length,
      counts: record.counts,
    });
  }

  const scans = config.testing.a11y === 'in-scope' ? await listA11yScans(store) : [];
  const conformance = buildA11yConformanceReport(config.a11y, scans);

  return {
    cases: interactive?.rows ?? [],
    caseCounts: interactive?.counts,
    specRuns: specRuns.sort(
      (a, b) => a.startedAt.localeCompare(b.startedAt) || a.runId.localeCompare(b.runId),
    ),
    accessibility:
      config.testing.a11y === 'in-scope' && conformance.scanCount > 0
        ? {
            wcagVersion: conformance.wcagVersion,
            level: conformance.level,
            scanCount: conformance.scanCount,
            counts: conformance.counts,
          }
        : undefined,
    defects: defectRows.sort((a, b) => a.id.localeCompare(b.id)),
    approvedRcas: approvedRcas.sort((a, b) => a.defectId.localeCompare(b.defectId)),
    unapprovedRcaCount,
  };
}

async function listRunRecordPaths(store: QaStore): Promise<readonly RelativePath[]> {
  return (await store.listFiles('runs')).filter((path) => path.endsWith('/run.json'));
}
