// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { RcaSchema, type Rca, type RcaStatus, type RelativePath } from '@qa-ai-stlc/schemas';
import type { ApprovalLedgerStore } from './approval-ledger-store.js';
import { assertDefectId, defectPath, type DefectStore } from './defect-store.js';
import { QaError } from './errors.js';
import { hashText } from './hash.js';
import type { ManifestStore } from './manifest-store.js';
import type { QaStore } from './qa-store.js';

/** The hash of the accepted defect an RCA is bound to; throws `RCA_DEFECT_NOT_ACCEPTED` when the defect is not accepted. */
export function assertDefectAccepted(defectId: string, defectSha256: string | undefined): string {
  if (defectSha256 === undefined) {
    throw new QaError('RCA_DEFECT_NOT_ACCEPTED', `Defect "${defectId}" is not accepted`, {
      remediation: 'An RCA exists only for an accepted defect: run "qa defect accept <id>" first.',
    });
  }
  return defectSha256;
}

export function rcaPath(defectId: string): RelativePath {
  return `artifacts/rca/${assertDefectId(defectId)}.json`;
}

/** The approval ledger gate an RCA's review is recorded under: one per defect, not a pipeline phase. */
export function rcaGate(defectId: string): string {
  return `rca:${assertDefectId(defectId)}`;
}

export interface RcaStoreOptions {
  readonly store: QaStore;
  readonly manifest: ManifestStore;
  readonly ledger: ApprovalLedgerStore;
  readonly defects: DefectStore;
}

/**
 * Reads and writes RCAs under `artifacts/rca/`. An RCA is `approved` only while three things still
 * hold (ADR-003, development plan section 2.4): the latest review approval hashes the file's
 * current content, its defect is still `accepted`, and that defect is byte-for-byte the one the RCA
 * was written against. Anything else reads back as `draft`, so an approved analysis cannot outlive
 * the defect it explains.
 */
export class RcaStore {
  private readonly store: QaStore;
  private readonly manifest: ManifestStore;
  private readonly ledger: ApprovalLedgerStore;
  private readonly defects: DefectStore;

  constructor(options: RcaStoreOptions) {
    this.store = options.store;
    this.manifest = options.manifest;
    this.ledger = options.ledger;
    this.defects = options.defects;
  }

  /** The RCA, after confirming the file is the one the engine registered. Throws `RCA_NOT_FOUND` when absent. */
  async read(defectId: string): Promise<Rca> {
    const rca = await this.manifest.readVerified(rcaPath(defectId), RcaSchema);
    if (rca === undefined) {
      throw new QaError('RCA_NOT_FOUND', `No registered RCA for defect "${defectId}"`, {
        remediation: 'Register the analysis first with "qa rca add --path <path>".',
      });
    }
    return rca;
  }

  async exists(defectId: string): Promise<boolean> {
    return this.store.pathExists(rcaPath(defectId));
  }

  /** Writes and registers `rca`; returns the exact text written, which is what an approval hashes. */
  async write(rca: Rca, serialized: string): Promise<string> {
    const path = rcaPath(rca.defectId);
    await this.store.writeText(path, serialized);
    await this.manifest.register(path, serialized);
    return this.store.readText(path);
  }

  /** The hash of the defect file as it is now, once it is confirmed accepted; `undefined` when it is not. */
  async currentAcceptedDefectSha256(defectId: string): Promise<string | undefined> {
    if (!(await this.defects.exists(defectId))) {
      return undefined;
    }
    const defect = await this.defects.read(defectId);
    if ((await this.defects.resolveStatus(defect)) !== 'accepted') {
      return undefined;
    }
    return hashText(await this.store.readText(defectPath(defectId)));
  }

  async resolveStatus(rca: Rca): Promise<RcaStatus> {
    if (rca.status !== 'approved') {
      return rca.status;
    }
    const path = rcaPath(rca.defectId);
    const approval = await this.ledger.latestForGate(rcaGate(rca.defectId));
    const isReviewed =
      approval?.artifactPath === path &&
      approval.artifactSha256 === hashText(await this.store.readText(path));
    const defectSha256 = await this.currentAcceptedDefectSha256(rca.defectId);
    return isReviewed && defectSha256 !== undefined && defectSha256 === rca.defectSha256
      ? 'approved'
      : 'draft';
  }
}
