// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  ApprovalLedgerSchema,
  SCHEMA_VERSION,
  type Approval,
  type ApprovalLedger,
  type RelativePath,
} from '@qa-ai-stlc/schemas';
import type { QaStore } from './qa-store.js';

const APPROVAL_LEDGER_PATH: RelativePath = 'artifacts/approval-ledger.json';

export interface ApprovalLedgerStoreOptions {
  readonly store: QaStore;
}

/**
 * `.qa/artifacts/approval-ledger.json`: an append-only record of every gate approval (ADR-003).
 * Never rewrites or removes an entry — re-approving a gate appends a new one instead of replacing
 * the old, so the ledger stays a full audit trail, not just a snapshot of the latest decision.
 */
export class ApprovalLedgerStore {
  private readonly store: QaStore;

  constructor(options: ApprovalLedgerStoreOptions) {
    this.store = options.store;
  }

  async load(): Promise<ApprovalLedger> {
    const exists = await this.store.pathExists(APPROVAL_LEDGER_PATH);
    if (!exists) {
      return { schemaVersion: SCHEMA_VERSION, approvals: [] };
    }
    return this.store.readJson(APPROVAL_LEDGER_PATH, ApprovalLedgerSchema);
  }

  async append(approval: Approval): Promise<void> {
    const ledger = await this.load();
    const next: ApprovalLedger = { ...ledger, approvals: [...ledger.approvals, approval] };
    await this.store.writeJson(APPROVAL_LEDGER_PATH, next);
  }

  /** The most recently appended approval for `gate`, if any. */
  async latestForGate(gate: string): Promise<Approval | undefined> {
    const ledger = await this.load();
    return [...ledger.approvals].reverse().find((approval) => approval.gate === gate);
  }
}
