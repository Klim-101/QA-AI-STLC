// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { setWidgetPopup } from '../browser-widget.js';
import type { BrowserOperationContext } from './browser-context.js';
import {
  runBrowserWidgetAction,
  type BrowserWidgetActionOptions,
  type BrowserWidgetActionResult,
} from './browser-widget-action.js';

/**
 * MCP `qa.browser_open_popup` (P6-43): opens a widget's popup (a list, a calendar) and checks it
 * is open. Does nothing when it already is.
 */
export function runBrowserOpenPopup(
  context: BrowserOperationContext,
  options: BrowserWidgetActionOptions,
): Promise<BrowserWidgetActionResult> {
  return runBrowserWidgetAction(context, options, {
    type: 'open-popup',
    async perform(session, selector) {
      await setWidgetPopup(session, selector, true);
    },
  });
}

/** MCP `qa.browser_close_popup` (P6-43): closes a widget's popup and checks it is closed. */
export function runBrowserClosePopup(
  context: BrowserOperationContext,
  options: BrowserWidgetActionOptions,
): Promise<BrowserWidgetActionResult> {
  return runBrowserWidgetAction(context, options, {
    type: 'close-popup',
    async perform(session, selector) {
      await setWidgetPopup(session, selector, false);
    },
  });
}
