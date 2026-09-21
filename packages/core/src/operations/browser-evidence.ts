// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { BrowserActionSchema, type BrowserActionType, type Evidence } from '@qa-ai-stlc/schemas';
import type { BrowserSession } from '../browser-session-store.js';
import type { EngineContext } from '../engine-context.js';
import { QaError } from '../errors.js';
import { EvidenceStore, type EvidenceRegisterOptions } from '../evidence-store.js';
import { toCanonicalJson } from '../json-file.js';
import { ManifestStore } from '../manifest-store.js';
import { QaStore } from '../qa-store.js';

/**
 * Builds the evidence store a browser operation registers through. Constructed per call, the way
 * `runExplore` builds its own stores: an `EvidenceStore` holds no state between calls — the
 * `.qa/` store and the manifest on disk are the state — so only the live browser sessions
 * themselves need to outlive a single MCP request.
 */
export function createBrowserEvidenceStore(context: EngineContext): EvidenceStore {
  const store = new QaStore({ projectRoot: context.projectRoot, fs: context.fs });
  const manifest = new ManifestStore({ store, clock: context.clock });
  return new EvidenceStore({ store, manifest, clock: context.clock });
}

/**
 * Registers evidence and fails the whole operation when the secret scanner quarantined it. A
 * browser tool must never report success for an action whose record was not registered — that is
 * exactly the "no unregistered screenshot possible" guarantee of ADR-005.
 */
export async function registerEvidenceOrThrow(
  evidenceStore: EvidenceStore,
  options: EvidenceRegisterOptions,
): Promise<Evidence> {
  const registration = await evidenceStore.register(options);
  if (registration.status === 'quarantined') {
    throw new QaError(
      'BROWSER_EVIDENCE_QUARANTINED',
      `Evidence "${options.id}" matched ${registration.patterns.join(', ')} and was quarantined instead of registered`,
      {
        remediation: `Remove the secret from the page under test, then retry. A sanitized receipt is at ${registration.receiptPath}.`,
      },
    );
  }
  return registration.evidence;
}

export interface BrowserActionDetails {
  readonly type: BrowserActionType;
  readonly url?: string;
  readonly selector?: string;
  /** The length of a filled value. The value itself is never recorded (AGENTS.md 5.8). */
  readonly valueLength?: number;
  readonly httpStatus?: number;
}

export interface RegisterBrowserActionOptions {
  readonly evidenceStore: EvidenceStore;
  readonly evidenceId: string;
  readonly session: BrowserSession;
  readonly now: Date;
  readonly action: BrowserActionDetails;
}

/** Writes one `action` evidence record for something the engine just did in the browser. */
export async function registerBrowserAction(options: RegisterBrowserActionOptions): Promise<Evidence> {
  const action = BrowserActionSchema.parse({
    type: options.action.type,
    sessionId: options.session.sessionId,
    ...(options.action.url !== undefined ? { url: options.action.url } : {}),
    ...(options.action.selector !== undefined ? { selector: options.action.selector } : {}),
    ...(options.action.valueLength !== undefined ? { valueLength: options.action.valueLength } : {}),
    ...(options.action.httpStatus !== undefined ? { httpStatus: options.action.httpStatus } : {}),
    at: options.now.toISOString(),
  });
  return registerEvidenceOrThrow(options.evidenceStore, {
    id: options.evidenceId,
    runId: options.session.runId,
    kind: 'action',
    content: toCanonicalJson(action),
  });
}
