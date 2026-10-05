// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { waitForBusyToClear } from '../browser-busy-wait.js';
import type { BrowserSession } from '../browser-session-store.js';
import { resolveWidget, valueMismatch } from '../browser-widget.js';
import { commitInput, readInputValue } from '../browser-widget-page.js';
import type { BrowserOperationContext } from './browser-context.js';
import {
  runBrowserWidgetAction,
  type BrowserWidgetActionOptions,
  type BrowserWidgetActionResult,
} from './browser-widget-action.js';

// A segmented masked input (Kendo UI for Angular's date input) turns a filled string into a
// different date, but takes the digits of the date typed one key at a time, each filling the next
// segment; typing over a selected value replaces it.
async function typeDigits(session: BrowserSession, input: string, value: string): Promise<void> {
  await session.page.click(input, { timeout: session.actionTimeoutMs });
  await session.page.keyboard.press('Control+a');
  for (const digit of value.replace(/\D/gu, '')) {
    await session.page.keyboard.press(digit);
  }
}

export interface BrowserSetDateOptions extends BrowserWidgetActionOptions {
  /** The date as the widget's own format spells it, which is what a person would type. */
  readonly value: string;
}

/**
 * MCP `qa.browser_set_date` (P6-43): types a date into a date picker's input (its digits only, for a
 * segmented masked one), commits it the way leaving the field does, and checks the input still holds that date. A widget that rejects the
 * text (a wrong format, a date out of range) clears or rewrites the input, which fails the check
 * instead of passing silently.
 */
export function runBrowserSetDate(
  context: BrowserOperationContext,
  options: BrowserSetDateOptions,
): Promise<BrowserWidgetActionResult> {
  return runBrowserWidgetAction(context, options, {
    type: 'set-date',
    valueLength: options.value.length,
    async perform(session, selector) {
      await waitForBusyToClear(session);
      const widget = await resolveWidget(session, selector);
      const input = `${widget.root} >> css=input:visible`;
      if (widget.inspection.dateEntry === 'digits') {
        await typeDigits(session, input, options.value);
      } else {
        await session.page.fill(input, options.value, { timeout: session.actionTimeoutMs });
      }
      await session.page
        .locator(input)
        .evaluate(commitInput, undefined, { timeout: session.actionTimeoutMs });
      await waitForBusyToClear(session);

      const shown = await session.page
        .locator(input)
        .evaluate(readInputValue, undefined, { timeout: session.actionTimeoutMs });
      const text = typeof shown === 'string' ? shown : '';
      if (text.trim() !== options.value.trim()) {
        throw valueMismatch(selector, options.value, text);
      }
    },
  });
}
