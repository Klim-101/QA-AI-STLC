// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import type { BrowserSession } from '../browser-session-store.js';
import type { BrowserOperationContext } from './browser-context.js';
import {
  createBrowserEvidenceStore,
  registerBrowserAction,
  type BrowserActionDetails,
} from './browser-evidence.js';

export interface BrowserWidgetActionOptions {
  readonly sessionId: string;
  /** A Playwright selector for the widget's wrapper: the element the explorer registered for it. */
  readonly selector: string;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface BrowserWidgetActionResult {
  readonly sessionId: string;
  readonly selector: string;
  /** The URL after the action. */
  readonly url: string;
  readonly evidence: Evidence;
}

/**
 * Runs one widget action and registers it as evidence once the action has verified its own
 * result: an action that throws leaves no record, so evidence never vouches for a widget state the
 * engine did not see.
 */
export async function runBrowserWidgetAction<TDetails extends object = object>(
  context: BrowserOperationContext,
  options: BrowserWidgetActionOptions,
  action: {
    readonly type: BrowserActionDetails['type'];
    /** How much was typed or chosen. The text itself is not recorded (AGENTS.md 5.8). */
    readonly valueLength?: number;
    /** What the action found out, returned to the caller next to the evidence; nothing for a plain action. */
    readonly perform: (session: BrowserSession) => Promise<TDetails> | Promise<void>;
  },
): Promise<BrowserWidgetActionResult & TDetails> {
  const session = await context.sessions.get(options.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);

  const details = await action.perform(session);
  const url = session.page.url();

  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: {
      type: action.type,
      selector: options.selector,
      url,
      ...(action.valueLength !== undefined ? { valueLength: action.valueLength } : {}),
    },
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return {
    ...(details as TDetails | undefined),
    sessionId: session.sessionId,
    selector: options.selector,
    url,
    evidence,
  } as BrowserWidgetActionResult & TDetails;
}
