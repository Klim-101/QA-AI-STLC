// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import type { SessionNotice } from '../browser-session-store.js';
import { collectNotices } from '../browser-tabs.js';
import { waitForBusyToClear } from '../browser-busy-wait.js';
import { resolveBrowserTarget } from '../element-refs.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

const CHARACTER_PLACEHOLDER = '[character]';

export interface BrowserPressOptions {
  readonly sessionId: string;
  /** A key or chord in Playwright's own spelling: `Enter`, `Escape`, `Control+a`. */
  readonly key: string;
  /** A Playwright selector for the element to focus first; leave this and `ref` out to press on the page. */
  readonly selector?: string;
  /** A ref from the latest `qa.browser_snapshot`; leave this and `selector` out to press on the page. */
  readonly ref?: string;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface BrowserPressResult {
  readonly sessionId: string;
  /** The key as recorded: a lone character is replaced by a placeholder. */
  readonly key: string;
  /** The selector the key was pressed on, absent when it was pressed on the page. */
  readonly selector?: string;
  /** The URL after the key press, which a navigation triggered by it can have changed. */
  readonly url: string;
  readonly evidence: Evidence;
  /** Dialogs and pages that appeared since a result last reported them (P6-59): page-controlled text, untrusted. */
  readonly notices?: SessionNotice[];
}

// A lone character typed through `press` can be a piece of a password, which must not survive in
// `.qa/` (AGENTS.md 5.8); a named key or a chord with a modifier carries no such content.
function toRecordedKey(key: string): string {
  return [...new Intl.Segmenter().segment(key)].length === 1 ? CHARACTER_PLACEHOLDER : key;
}

/**
 * MCP `qa.browser_press` (P6-56): presses a key or chord, on one element or on whatever has focus,
 * and registers it as evidence. A key that submits a form sets off the same non-GET request a
 * click would, and the session's safe-mode handler aborts it (AGENTS.md 12.4).
 */
export async function runBrowserPress(
  context: BrowserOperationContext,
  options: BrowserPressOptions,
): Promise<BrowserPressResult> {
  const session = await context.sessions.get(options.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const target =
    options.selector === undefined && options.ref === undefined
      ? undefined
      : await resolveBrowserTarget(session, options);

  await waitForBusyToClear(session);
  if (target === undefined) {
    await session.page.keyboard.press(options.key);
  } else {
    await session.page.press(target.selector, options.key, { timeout: session.actionTimeoutMs });
  }
  await waitForBusyToClear(session);
  const url = session.page.url();
  const key = toRecordedKey(options.key);

  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: {
      type: 'press',
      key,
      ...(target === undefined ? {} : { selector: target.selector }),
      ...(target?.ref === undefined ? {} : { ref: target.ref }),
      url,
    },
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return {
    sessionId: session.sessionId,
    key,
    ...(target === undefined ? {} : { selector: target.selector }),
    url,
    evidence,
    ...(await collectNotices(context, session)),
  };
}
