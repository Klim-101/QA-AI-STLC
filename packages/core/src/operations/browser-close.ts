// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import type { BlockedRequest } from '../browser-safe-mode.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

export interface BrowserCloseOptions {
  readonly sessionId: string;
}

export interface BrowserCloseResult {
  readonly sessionId: string;
  readonly runId: string;
  /** Every non-GET request safe mode aborted over the session's lifetime. */
  readonly blockedRequests: readonly BlockedRequest[];
  readonly evidence: Evidence;
}

/**
 * MCP `qa.browser_close` (P2-06): records the end of the session and shuts its browser down.
 * The browser is closed even when registering that record fails, so a failed write can never
 * strand a real Chromium process.
 */
export async function runBrowserClose(
  context: BrowserOperationContext,
  options: BrowserCloseOptions,
): Promise<BrowserCloseResult> {
  const session = await context.sessions.get(options.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const blockedRequests = [...session.blockedRequests];

  try {
    const evidence = await registerBrowserAction({
      evidenceStore,
      evidenceId: context.sessions.nextEvidenceId(),
      session,
      now: context.engine.clock.now(),
      action: { type: 'close', url: session.page.url() },
    });
    return { sessionId: session.sessionId, runId: session.runId, blockedRequests, evidence };
  } finally {
    await context.sessions.close(session.sessionId);
  }
}
