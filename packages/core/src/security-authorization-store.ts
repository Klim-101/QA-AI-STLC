// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  SecurityAuthorizationSchema,
  type RelativePath,
  type SecurityAuthorization,
} from '@qa-ai-stlc/schemas';
import type { ApprovalLedgerStore } from './approval-ledger-store.js';
import { hashText } from './hash.js';
import type { ManifestStore } from './manifest-store.js';
import type { QaStore } from './qa-store.js';

export const SECURITY_AUTHORIZATION_PATH: RelativePath = 'artifacts/security/authorization.json';

/** The approval ledger gate the audit authorization is recorded under: one per project, not a pipeline phase. */
export const SECURITY_AUTHORIZATION_GATE = 'security-authorization';

export interface SecurityAuthorizationStoreOptions {
  readonly store: QaStore;
  readonly manifest: ManifestStore;
  readonly ledger: ApprovalLedgerStore;
}

/**
 * Reads and writes the security audit authorization. It counts as approved only while the latest
 * approval for the gate hashes the file's current content (ADR-003), so editing the authorization
 * after approval withdraws the consent.
 */
export class SecurityAuthorizationStore {
  private readonly store: QaStore;
  private readonly manifest: ManifestStore;
  private readonly ledger: ApprovalLedgerStore;

  constructor(options: SecurityAuthorizationStoreOptions) {
    this.store = options.store;
    this.manifest = options.manifest;
    this.ledger = options.ledger;
  }

  /** The authorization, after confirming the file is the one the engine registered; `undefined` when absent. */
  async read(): Promise<SecurityAuthorization | undefined> {
    return this.manifest.readVerified(SECURITY_AUTHORIZATION_PATH, SecurityAuthorizationSchema);
  }

  /** Writes and registers the authorization; returns the exact text written, which is what an approval hashes. */
  async write(serialized: string): Promise<string> {
    await this.store.writeText(SECURITY_AUTHORIZATION_PATH, serialized);
    await this.manifest.register(SECURITY_AUTHORIZATION_PATH, serialized);
    return this.store.readText(SECURITY_AUTHORIZATION_PATH);
  }

  async readText(): Promise<string> {
    return this.store.readText(SECURITY_AUTHORIZATION_PATH);
  }

  /** Whether the latest approval hashes the content on disk right now. */
  async isApproved(): Promise<boolean> {
    const approval = await this.ledger.latestForGate(SECURITY_AUTHORIZATION_GATE);
    if (approval?.artifactPath !== SECURITY_AUTHORIZATION_PATH) {
      return false;
    }
    return approval.artifactSha256 === hashText(await this.store.readText(SECURITY_AUTHORIZATION_PATH));
  }
}
