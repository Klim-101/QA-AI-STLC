// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

export interface QaErrorOptions {
  readonly remediation?: string;
  readonly cause?: unknown;
}

/**
 * Every expected engine failure (bad config, hash mismatch, unregistered artifact) is a
 * `QaError` with a stable, machine-readable `code` an agent or CLI flag can branch on, and an
 * optional `remediation` it can act on or show the operator (AGENTS.md 5.4).
 */
export class QaError extends Error {
  readonly code: string;
  readonly remediation: string | undefined;

  constructor(code: string, message: string, options: QaErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'QaError';
    this.code = code;
    this.remediation = options.remediation;
  }
}
