// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

export interface BrowserClickOptions {
  readonly sessionId: string;
  readonly selector: string;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface BrowserClickResult {
  readonly sessionId: string;
  readonly selector: string;
  /** The URL after the click, which a navigation triggered by it can have changed. */
  readonly url: string;
  readonly evidence: Evidence;
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

  await session.page.click(options.selector);
  const url = session.page.url();

  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: { type: 'click', selector: options.selector, url },
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return { sessionId: session.sessionId, selector: options.selector, url, evidence };
}
