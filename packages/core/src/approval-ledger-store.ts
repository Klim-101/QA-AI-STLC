// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  ApprovalLedgerSchema,
  SCHEMA_VERSION,
  type Approval,
  type ApprovalLedger,
  type RelativePath,
} from '@qa-ai-stlc/schemas';
import { toCanonicalJson } from './json-file.js';
import type { ManifestStore } from './manifest-store.js';
import type { QaStore } from './qa-store.js';

export const APPROVAL_LEDGER_PATH: RelativePath = 'artifacts/approval-ledger.json';

export interface ApprovalLedgerStoreOptions {
  readonly store: QaStore;
  readonly manifest: ManifestStore;
}

/**
 * `.qa/artifacts/approval-ledger.json`: an append-only record of every gate approval (ADR-003).
 * Never rewrites or removes an entry — re-approving a gate appends a new one instead of replacing
 * the old, so the ledger stays a full audit trail, not just a snapshot of the latest decision.
 * Registered in the manifest on every `append()` (#278) so a hand-edit to this file — for example
 * rewriting an approval's `artifactSha256` to match a separately tampered artifact — is itself
 * caught by `qa validate`'s tamper check, the same as any other engine-produced artifact.
 */
export class ApprovalLedgerStore {
  private readonly store: QaStore;
  private readonly manifest: ManifestStore;

  constructor(options: ApprovalLedgerStoreOptions) {
    this.store = options.store;
    this.manifest = options.manifest;
  }

  async load(): Promise<ApprovalLedger> {
    const exists = await this.store.pathExists(APPROVAL_LEDGER_PATH);
    if (!exists) {
      return { schemaVersion: SCHEMA_VERSION, approvals: [] };
    }
    const manifest = await this.manifest.load();
    if (manifest.artifacts[APPROVAL_LEDGER_PATH] === undefined) {
      // Exists on disk but was never registered by append() -- a hand-written forgery (#304),
      // not a project with no approvals yet. Its content is never trusted for gate computation;
      // treated the same as an empty ledger here, while validate()'s tamper scan still surfaces
      // the path itself so the forgery stays visible rather than silently ignored.
      return { schemaVersion: SCHEMA_VERSION, approvals: [] };
    }
    return this.store.readJson(APPROVAL_LEDGER_PATH, ApprovalLedgerSchema);
  }

  async append(approval: Approval): Promise<void> {
    const ledger = await this.load();
    const next: ApprovalLedger = { ...ledger, approvals: [...ledger.approvals, approval] };
    const serialized = toCanonicalJson(next);
    await this.store.writeText(APPROVAL_LEDGER_PATH, serialized);
    await this.manifest.register(APPROVAL_LEDGER_PATH, serialized);
  }

  /** The most recently appended approval for `gate`, if any. */
  async latestForGate(gate: string): Promise<Approval | undefined> {
    const ledger = await this.load();
    return [...ledger.approvals].reverse().find((approval) => approval.gate === gate);
  }
}
