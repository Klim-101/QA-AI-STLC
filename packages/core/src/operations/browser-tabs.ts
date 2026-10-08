// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import { closeDisallowedTabs, settleSessionPages } from '../browser-tabs.js';
import type { SessionNotice } from '../browser-session-store.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

/**
 * The longest `qa.browser_tabs` waits, counted from the previous tool call, for a page that call
 * opened. The browser announces a new page after the action that opened it has already returned
 * (about 650 ms on a slow Windows machine) and nothing says whether one is on its way, so the wait
 * ends at the first announcement or at this deadline, whichever comes first.
 */
export const DEFAULT_TAB_SETTLE_MS = 2_000;

export interface BrowserTabsOptions {
  readonly sessionId: string;
  /** Overrides the deadline for a page that is still opening; tests use 0. */
  readonly settleMs?: number;
  /** The id of the tab to make active. Omit to only list the tabs. */
  readonly switchTo?: string;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface BrowserTabSummary {
  readonly tabId: string;
  readonly url: string;
  /** Page-controlled text: untrusted. */
  readonly title: string;
  readonly active: boolean;
}

export interface BrowserTabsResult {
  readonly sessionId: string;
  readonly activeTabId: string;
  readonly tabs: readonly BrowserTabSummary[];
  readonly notices: readonly SessionNotice[];
  /** The switch, when one was asked for. */
  readonly evidence?: Evidence;
}

/**
 * MCP `qa.browser_tabs` (P6-59): lists the pages the session has open and, when asked, makes one
 * the active page every later action acts on. A page the application opened is held to the same
 * allowlist as the first: one found off it is closed and reported rather than listed. Switching
 * retires the element refs of the page it leaves.
 */
export async function runBrowserTabs(
  context: BrowserOperationContext,
  options: BrowserTabsOptions,
): Promise<BrowserTabsResult> {
  // Read before `get`, which counts as a use: the wait only covers what is left of the deadline.
  const idleMs = context.sessions.msSinceLastUse(options.sessionId);
  const session = await context.sessions.get(options.sessionId);
  const remainingMs = (options.settleMs ?? DEFAULT_TAB_SETTLE_MS) - idleMs;
  if (remainingMs > 0) {
    await context.sessions.waitForTabAnnouncement(session.sessionId, idleMs, remainingMs);
  }
  // Settles dialog and popup handling still in flight before anything is listed.
  const earlierNotices = await settleSessionPages(context, session);
  await closeDisallowedTabs(context, session);

  let evidence: Evidence | undefined;
  if (options.switchTo !== undefined) {
    const tab = context.sessions.activateTab(session.sessionId, options.switchTo);
    await tab.page.bringToFront();
    evidence = await registerBrowserAction({
      evidenceStore: createBrowserEvidenceStore(context.engine),
      evidenceId: context.sessions.nextEvidenceId(),
      session,
      now: context.engine.clock.now(),
      action: { type: 'tab-switch', tabId: tab.tabId, url: tab.page.url() },
      ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
    });
  }

  const tabs = await Promise.all(
    session.tabs.map(async (tab): Promise<BrowserTabSummary> => ({
      tabId: tab.tabId,
      url: tab.page.url(),
      title: await tab.page.title(),
      active: tab.tabId === session.activeTabId,
    })),
  );
  const laterNotices = await settleSessionPages(context, session);

  return {
    sessionId: session.sessionId,
    activeTabId: session.activeTabId,
    tabs,
    notices: [...earlierNotices, ...laterNotices],
    ...(evidence === undefined ? {} : { evidence }),
  };
}
