// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import {
  BrowserActionSchema,
  type BrowserActionType,
  type Evidence,
  type Identifier,
} from '@qa-ai-stlc/schemas';
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
  /**
   * The case step this action performs (`'step-<N>'`, `N` the step's 1-based position in the
   * case's `steps`), when the caller is executing a registered case (`qa-execute`, P3-15) rather
   * than free exploration. Stored inside the evidence content itself (`BrowserActionSchema`), not
   * only on the `Evidence` wrapper this function returns — the wrapper is never written to disk on
   * its own, so `qa-generate-tests` (P3-07) recovering a proven session's steps later has nowhere
   * else to read it back from.
   */
  readonly stepId?: Identifier;
}

/** Writes one `action` evidence record for something the engine just did in the browser. */
export async function registerBrowserAction(options: RegisterBrowserActionOptions): Promise<Evidence> {
  const action = BrowserActionSchema.parse({
    type: options.action.type,
    sessionId: options.session.sessionId,
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
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
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });
}
