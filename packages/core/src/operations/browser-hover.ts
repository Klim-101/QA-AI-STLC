// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import { waitForBusyToClear } from '../browser-busy-wait.js';
import { resolveBrowserTarget } from '../element-refs.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

export interface BrowserHoverOptions {
  readonly sessionId: string;
  /** A Playwright selector; give this or `ref`. */
  readonly selector?: string;
  /** A ref from the latest `qa.browser_snapshot`; give this or `selector`. */
  readonly ref?: string;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface BrowserHoverResult {
  readonly sessionId: string;
  readonly selector: string;
  readonly url: string;
  readonly evidence: Evidence;
}

/**
 * MCP `qa.browser_hover` (P6-56): moves the pointer over one element, which opens a tooltip or a
 * hover menu, and registers the hover as evidence.
 */
export async function runBrowserHover(
  context: BrowserOperationContext,
  options: BrowserHoverOptions,
): Promise<BrowserHoverResult> {
  const session = await context.sessions.get(options.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const target = await resolveBrowserTarget(session, options);

  await waitForBusyToClear(session);
  await session.page.hover(target.selector, { timeout: session.actionTimeoutMs });
  await waitForBusyToClear(session);
  const url = session.page.url();

  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: {
      type: 'hover',
      selector: target.selector,
      ...(target.ref === undefined ? {} : { ref: target.ref }),
      url,
    },
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return { sessionId: session.sessionId, selector: target.selector, url, evidence };
}
