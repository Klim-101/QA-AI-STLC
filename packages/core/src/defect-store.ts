// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  DefectDraftSchema,
  type DefectDraft,
  type DefectStatus,
  type RelativePath,
} from '@qa-ai-stlc/schemas';
import type { ApprovalLedgerStore } from './approval-ledger-store.js';
import { QaError } from './errors.js';
import { hashText } from './hash.js';
import type { ManifestStore } from './manifest-store.js';
import type { QaStore } from './qa-store.js';

export const DEFECTS_DIR: RelativePath = 'artifacts/defects/';

// The id becomes a file name and part of a ledger gate name, so it is a plain slug: no separators,
// dots or whitespace that could place the file outside `artifacts/defects/`.
const DEFECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

export function assertDefectId(id: string): string {
  if (!DEFECT_ID_PATTERN.test(id)) {
    throw new QaError('DEFECT_ID_INVALID', `"${id}" is not a valid defect id`, {
      remediation: 'Use letters, digits, "-" and "_" only, starting with a letter or digit.',
    });
  }
  return id;
}

export function defectPath(id: string): RelativePath {
  return `${DEFECTS_DIR}${assertDefectId(id)}.json`;
}

/** The approval ledger gate a defect's acceptance is recorded under: one gate per defect, not a pipeline phase. */
export function defectGate(id: string): string {
  return `defect:${assertDefectId(id)}`;
}

export interface DefectStoreOptions {
  readonly store: QaStore;
  readonly manifest: ManifestStore;
  readonly ledger: ApprovalLedgerStore;
}

/**
 * Reads and writes defect drafts under `artifacts/defects/`. A draft is `accepted` only through a
 * hash-bound approval (ADR-003): the `status` written in the file is a claim, and
 * `resolveStatus()` honours it only while the file is still the exact content the latest approval
 * for that defect hashed. A hand-written `accepted`, or an accepted draft edited afterwards,
 * therefore reads back as `draft`.
 */
export class DefectStore {
  private readonly store: QaStore;
  private readonly manifest: ManifestStore;
  private readonly ledger: ApprovalLedgerStore;

  constructor(options: DefectStoreOptions) {
    this.store = options.store;
    this.manifest = options.manifest;
    this.ledger = options.ledger;
  }

  /** The draft, after confirming the file is the one the engine registered. Throws `DEFECT_NOT_FOUND` when absent. */
  async read(id: string): Promise<DefectDraft> {
    const path = defectPath(id);
    const draft = await this.manifest.readVerified(path, DefectDraftSchema);
    if (draft === undefined) {
      throw new QaError('DEFECT_NOT_FOUND', `No registered defect draft with id "${id}"`, {
        remediation: 'Register the draft first with "qa defect add --path <path>".',
      });
    }
    return draft;
  }

  async exists(id: string): Promise<boolean> {
    return this.store.pathExists(defectPath(id));
  }

  /** Writes and registers `draft`; returns the exact text written, which is what an approval hashes. */
  async write(draft: DefectDraft, serialized: string): Promise<string> {
    const path = defectPath(draft.id);
    await this.store.writeText(path, serialized);
    await this.manifest.register(path, serialized);
    return this.store.readText(path);
  }

  /** `accepted` only while the latest approval for this defect hashes the file's current content. */
  async resolveStatus(draft: DefectDraft): Promise<DefectStatus> {
    if (draft.status !== 'accepted') {
      return draft.status;
    }
    const path = defectPath(draft.id);
    const approval = await this.ledger.latestForGate(defectGate(draft.id));
    const content = await this.store.readText(path);
    const isApproved =
      approval !== undefined &&
      approval.artifactPath === path &&
      approval.artifactSha256 === hashText(content);
    return isApproved ? 'accepted' : 'draft';
  }
}
