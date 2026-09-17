// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  EvidenceQuarantineReceiptSchema,
  EvidenceSchema,
  type Evidence,
  type EvidenceKind,
  type Identifier,
  type RelativePath,
} from '@qa-ai-stlc/schemas';
import { hashContent } from './hash.js';
import { toCanonicalJson } from './json-file.js';
import { systemClock, type Clock } from './ports/clock.js';
import { redactHar } from './redaction.js';
import { scanForSecrets } from './secret-scan.js';
import type { ManifestStore } from './manifest-store.js';
import type { QaStore } from './qa-store.js';

const DEFAULT_FILE_EXTENSIONS: Readonly<Record<EvidenceKind, string>> = {
  screenshot: 'png',
  trace: 'zip',
  'network-har': 'har',
  'console-log': 'log',
  video: 'webm',
  other: 'bin',
};

export interface EvidenceRegisterOptions {
  readonly id: Identifier;
  readonly runId: Identifier;
  readonly stepId?: Identifier;
  readonly kind: EvidenceKind;
  readonly content: string | Uint8Array;
  /** Without a leading dot. Defaults to a sensible extension for `kind`. */
  readonly fileExtension?: string;
}

export type EvidenceRegistration =
  | { readonly status: 'registered'; readonly evidence: Evidence }
  | {
      readonly status: 'quarantined';
      readonly receiptPath: RelativePath;
      readonly patterns: readonly string[];
    };

export interface EvidenceStoreOptions {
  readonly store: QaStore;
  readonly manifest: ManifestStore;
  readonly clock?: Clock;
}

/**
 * Registers evidence the way AGENTS.md 2.5/12.5 require: hashed, timestamped, linked to a step,
 * and scanned for leaked secrets before anything is written to disk. `network-har` content is
 * redacted proactively (development plan section 6.4); the secret scan is the safety net for
 * everything else, or for whatever that redaction pass could not understand. Content that still
 * matches a known secret shape after redaction is never written — a sanitized quarantine receipt
 * is registered in its place instead (AGENTS.md 12.5).
 */
export class EvidenceStore {
  private readonly store: QaStore;
  private readonly manifest: ManifestStore;
  private readonly clock: Clock;

  constructor(options: EvidenceStoreOptions) {
    this.store = options.store;
    this.manifest = options.manifest;
    this.clock = options.clock ?? systemClock;
  }

  async register(options: EvidenceRegisterOptions): Promise<EvidenceRegistration> {
    const extension = options.fileExtension ?? DEFAULT_FILE_EXTENSIONS[options.kind];
    let content = options.content;
    let redacted = false;

    if (options.kind === 'network-har' && typeof content === 'string') {
      const result = redactHar(content);
      content = result.content;
      redacted = result.redacted;
    }

    const textForScan = typeof content === 'string' ? content : Buffer.from(content).toString('latin1');
    const matches = scanForSecrets(textForScan);
    if (matches.length > 0) {
      const patterns = matches.map((match) => match.pattern);
      const receiptPath = await this.writeQuarantineReceipt(options, patterns);
      return { status: 'quarantined', receiptPath, patterns };
    }

    const relativePath: RelativePath = `evidence/${options.runId}/${options.id}.${extension}`;
    await this.store.writeBytes(relativePath, content);
    await this.manifest.register(relativePath, content);

    const evidence = EvidenceSchema.parse({
      id: options.id,
      runId: options.runId,
      ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
      kind: options.kind,
      path: relativePath,
      sha256: hashContent(content),
      createdAt: this.clock.now().toISOString(),
      redacted,
    });

    return { status: 'registered', evidence };
  }

  private async writeQuarantineReceipt(
    options: EvidenceRegisterOptions,
    patterns: readonly string[],
  ): Promise<RelativePath> {
    const receiptPath: RelativePath = `evidence/${options.runId}/${options.id}.quarantine.json`;
    const receipt = EvidenceQuarantineReceiptSchema.parse({
      id: options.id,
      runId: options.runId,
      ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
      kind: options.kind,
      createdAt: this.clock.now().toISOString(),
      reason: 'secret-detected',
      patterns,
    });
    await this.store.writeJson(receiptPath, receipt);
    await this.manifest.register(receiptPath, toCanonicalJson(receipt));
    return receiptPath;
  }
}
