// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import type { SessionNotice } from '../browser-session-store.js';
import { collectNotices } from '../browser-tabs.js';
import { waitForBusyToClear } from '../browser-busy-wait.js';
import { resolveBrowserTarget } from '../element-refs.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

export interface BrowserClickOptions {
  readonly sessionId: string;
  /** A Playwright selector; give this or `ref`. */
  readonly selector?: string;
  /** A ref from the latest `qa.browser_snapshot`; give this or `selector`. */
  readonly ref?: string;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface BrowserClickResult {
  readonly sessionId: string;
  /** The selector acted on: the one given, or the one the ref resolved to. */
  readonly selector: string;
  /** The URL after the click, which a navigation triggered by it can have changed. */
  readonly url: string;
  readonly evidence: Evidence;
  /** Dialogs and pages that appeared since a result last reported them (P6-59): page-controlled text, untrusted. */
  readonly notices?: SessionNotice[];
}

/**
 * MCP `qa.browser_click` (P2-06): clicks one element and registers the click as evidence. Any
 * non-GET request the click sets off is still aborted by the session's safe-mode handler
 * (AGENTS.md 12.4).
 */
export async function runBrowserClick(
  context: BrowserOperationContext,
  options: BrowserClickOptions,
): Promise<BrowserClickResult> {
  const session = await context.sessions.get(options.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const target = await resolveBrowserTarget(session, options);

  await waitForBusyToClear(session);
  await session.page.click(target.selector, { timeout: session.actionTimeoutMs });
  await waitForBusyToClear(session);
  const url = session.page.url();

  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: {
      type: 'click',
      selector: target.selector,
      ...(target.ref === undefined ? {} : { ref: target.ref }),
      url,
    },
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return {
    sessionId: session.sessionId,
    selector: target.selector,
    url,
    evidence,
    ...(await collectNotices(context, session)),
  };
}
