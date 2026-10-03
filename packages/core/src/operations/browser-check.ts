// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { Evidence } from '@qa-ai-stlc/schemas';
import type { SessionNotice } from '../browser-session-store.js';
import { collectNotices } from '../browser-tabs.js';
import { waitForBusyToClear } from '../browser-busy-wait.js';
import { readElementState } from '../browser-expect-page.js';
import { resolveBrowserTarget } from '../element-refs.js';
import { QaError } from '../errors.js';
import { ElementReadingSchema } from '../expectation.js';
import type { BrowserOperationContext } from './browser-context.js';
import { createBrowserEvidenceStore, registerBrowserAction } from './browser-evidence.js';

export interface BrowserCheckOptions {
  readonly sessionId: string;
  /** A Playwright selector; give this or `ref`. */
  readonly selector?: string;
  /** A ref from the latest `qa.browser_snapshot`; give this or `selector`. */
  readonly ref?: string;
  /** The state to leave the box in; checked when omitted. */
  readonly checked?: boolean;
  /** `'step-<N>'`, `N` the case step's 1-based position, during an interactive execution session (P3-15). */
  readonly stepId?: string;
}

export interface BrowserCheckResult {
  readonly sessionId: string;
  readonly selector: string;
  /** The state read back from the box after setting it. */
  readonly checked: boolean;
  readonly url: string;
  readonly evidence: Evidence;
  /** Dialogs and pages that appeared since a result last reported them (P6-59): page-controlled text, untrusted. */
  readonly notices?: SessionNotice[];
}

/**
 * MCP `qa.browser_check` (P6-56): sets one checkbox or radio to a state and reads the box back. A
 * box the page left in another state (a handler that undoes the click) is
 * `BROWSER_CHECK_NOT_APPLIED` and registers nothing, so a record never claims a state the page did
 * not show.
 */
export async function runBrowserCheck(
  context: BrowserOperationContext,
  options: BrowserCheckOptions,
): Promise<BrowserCheckResult> {
  const session = await context.sessions.get(options.sessionId);
  const evidenceStore = createBrowserEvidenceStore(context.engine);
  const target = await resolveBrowserTarget(session, options);
  const wanted = options.checked ?? true;

  await waitForBusyToClear(session);
  await session.page.setChecked(target.selector, wanted, { timeout: session.actionTimeoutMs });
  await waitForBusyToClear(session);
  const reading = ElementReadingSchema.safeParse(
    await session.page
      .locator(target.selector)
      .evaluate(readElementState, undefined, { timeout: session.actionTimeoutMs }),
  );
  const shown = reading.success ? reading.data.checked : null;
  if (shown !== wanted) {
    throw new QaError(
      'BROWSER_CHECK_NOT_APPLIED',
      `After setting "${target.selector}" to ${String(wanted)} the page showed ${shown === null ? 'no checked state' : `checked: ${String(shown)}`}`,
      {
        remediation:
          'Check that the element is a checkbox, a radio or a role=checkbox widget, and that the page does not reset it.',
      },
    );
  }
  const url = session.page.url();

  const evidence = await registerBrowserAction({
    evidenceStore,
    evidenceId: context.sessions.nextEvidenceId(),
    session,
    now: context.engine.clock.now(),
    action: {
      type: 'check',
      selector: target.selector,
      ...(target.ref === undefined ? {} : { ref: target.ref }),
      checked: shown,
      url,
    },
    ...(options.stepId !== undefined ? { stepId: options.stepId } : {}),
  });

  return {
    sessionId: session.sessionId,
    selector: target.selector,
    checked: shown,
    url,
    evidence,
    ...(await collectNotices(context, session)),
  };
}
