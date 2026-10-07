// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { RcaSchema, type Approval, type RcaStatus } from '@qa-ai-stlc/schemas';
import { ApprovalLedgerStore } from '../approval-ledger-store.js';
import { DefectStore } from '../defect-store.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { hashText } from '../hash.js';
import { readJsonFile, toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { assertRelativePath, resolveRelativePath } from '../paths.js';
import { QaStore } from '../qa-store.js';
import { RcaStore, rcaGate, rcaPath } from '../rca-store.js';

function openStores(context: EngineContext): {
  readonly ledger: ApprovalLedgerStore;
  readonly rcas: RcaStore;
} {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  const ledger = new ApprovalLedgerStore({ store, manifest });
  const defects = new DefectStore({ store, manifest, ledger });
  return { ledger, rcas: new RcaStore({ store, manifest, ledger, defects }) };
}

function assertDefectAccepted(defectId: string, defectSha256: string | undefined): string {
  if (defectSha256 === undefined) {
    throw new QaError('RCA_DEFECT_NOT_ACCEPTED', `Defect "${defectId}" is not accepted`, {
      remediation: 'An RCA exists only for an accepted defect: run "qa defect accept <id>" first.',
    });
  }
  return defectSha256;
}

export interface RcaAddOptions {
  readonly path?: string;
}

export interface RcaAddResult {
  readonly defectId: string;
  readonly rcaPath: string;
}

/**
 * `qa rca add --path <path>` / MCP `qa.rca_add` (P6-14): validates a root cause analysis a human or
 * the `qa-rca` spoke wrote as JSON and registers it under `artifacts/rca/<defect-id>.json`. No
 * defect, no RCA (development plan section 2.4): the defect it analyses must be `accepted`. The
 * engine stamps the SHA-256 of that defect onto the RCA, so the analysis is bound to the defect it
 * was written against. A new RCA is always `draft`; review is a separate step (`runRcaApprove`),
 * and an approved RCA is never overwritten.
 */
export async function runRcaAdd(context: EngineContext, options: RcaAddOptions): Promise<RcaAddResult> {
  if (options.path === undefined) {
    throw new QaError('RCA_ADD_USAGE', 'Usage: qa rca add --path <path>', {
      remediation: 'Example: qa rca add --path rca/login-error.json',
    });
  }
  const path = assertRelativePath(options.path);
  const absolutePath = resolveRelativePath(context.projectRoot, path);
  if (!(await context.fs.pathExists(absolutePath))) {
    throw new QaError('RCA_ADD_FILE_NOT_FOUND', `"${path}" does not exist`, {
      remediation: 'Check --path points at a real, readable file relative to the project root.',
    });
  }
  const rca = await readJsonFile(context.fs, absolutePath, RcaSchema);
  if (rca.status !== 'draft') {
    throw new QaError(
      'RCA_ADD_STATUS_INVALID',
      `The RCA for "${rca.defectId}" arrives with status "${rca.status}"; a new RCA must be "draft"`,
      { remediation: 'Set "status" to "draft"; review is recorded with "qa rca approve".' },
    );
  }

  const { rcas } = openStores(context);
  const defectSha256 = assertDefectAccepted(
    rca.defectId,
    await rcas.currentAcceptedDefectSha256(rca.defectId),
  );
  if (await rcas.exists(rca.defectId)) {
    const existing = await rcas.read(rca.defectId);
    if ((await rcas.resolveStatus(existing)) === 'approved') {
      throw new QaError('RCA_ALREADY_APPROVED', `The RCA for "${rca.defectId}" is already approved`, {
        remediation: 'An approved RCA is never overwritten.',
      });
    }
  }

  const stamped = { ...rca, defectSha256 };
  await rcas.write(stamped, toCanonicalJson(stamped));
  return { defectId: rca.defectId, rcaPath: rcaPath(rca.defectId) };
}

export interface RcaApproveOptions {
  readonly defectId?: string;
  readonly approvedBy?: string;
  readonly note?: string;
}

export interface RcaApproveResult {
  readonly defectId: string;
  readonly status: RcaStatus;
  /** True when the RCA was already approved and nothing was recorded. */
  readonly wasAlreadyApproved: boolean;
}

/**
 * `qa rca approve <defect-id> --approved-by <name>` / MCP `qa.rca_approve` (P6-14, ADR-003): the RCA
 * review gate. Approves the registered RCA only while its defect is still the accepted one it was
 * written against, and binds the approval to the SHA-256 of the exact approved content. Only an
 * approved RCA attaches to the report and the release recommendation.
 */
export async function runRcaApprove(
  context: EngineContext,
  options: RcaApproveOptions,
): Promise<RcaApproveResult> {
  if (options.defectId === undefined || options.approvedBy === undefined) {
    throw new QaError('RCA_APPROVE_USAGE', 'Usage: qa rca approve <defect-id> --approved-by <name>', {
      remediation: 'Example: qa rca approve login-error --approved-by operator',
    });
  }
  const { ledger, rcas } = openStores(context);
  const rca = await rcas.read(options.defectId);
  if (rca.status === 'rejected') {
    throw new QaError('RCA_REJECTED', `The RCA for "${rca.defectId}" was rejected and cannot be approved`, {
      remediation: 'Register a new analysis instead.',
    });
  }
  const defectSha256 = assertDefectAccepted(
    rca.defectId,
    await rcas.currentAcceptedDefectSha256(rca.defectId),
  );
  if (defectSha256 !== rca.defectSha256) {
    throw new QaError('RCA_DEFECT_CHANGED', `Defect "${rca.defectId}" changed since its RCA was written`, {
      remediation: 'Register the analysis again with "qa rca add --path <path>", then approve it.',
    });
  }
  if ((await rcas.resolveStatus(rca)) === 'approved') {
    return { defectId: rca.defectId, status: 'approved', wasAlreadyApproved: true };
  }

  // The approval hashes what is read back from disk, the same bytes `resolveStatus` compares
  // (AGENTS.md 12.7).
  const approved = { ...rca, status: 'approved' as const };
  const content = await rcas.write(approved, toCanonicalJson(approved));
  const approval: Approval = {
    gate: rcaGate(rca.defectId),
    artifactPath: rcaPath(rca.defectId),
    artifactSha256: hashText(content),
    approvedBy: options.approvedBy,
    approvedAt: context.clock.now().toISOString(),
    ...(options.note !== undefined ? { note: options.note } : {}),
  };
  await ledger.append(approval);

  return { defectId: rca.defectId, status: 'approved', wasAlreadyApproved: false };
}
