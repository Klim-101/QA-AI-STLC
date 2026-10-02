// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { waitForBusyToClear } from '../browser-busy-wait.js';
import { optionSelector, setWidgetPopup, verifyDisplayedText } from '../browser-widget.js';
import { readOptionSelected } from '../browser-widget-page.js';
import { QaError } from '../errors.js';
import type { BrowserOperationContext } from './browser-context.js';
import {
  runBrowserWidgetAction,
  type BrowserWidgetActionOptions,
  type BrowserWidgetActionResult,
} from './browser-widget-action.js';

export interface BrowserSelectOptionOptions extends BrowserWidgetActionOptions {
  /** The option's visible text, exactly as the list shows it. */
  readonly optionText: string;
}

/**
 * MCP `qa.browser_select_option` (P6-43): opens a list widget, picks the option with the given
 * visible text and checks the widget now shows it. Picking an option that is already chosen
 * leaves it chosen (a multi-select would otherwise un-pick it), and the popup is closed afterwards.
 */
export function runBrowserSelectOption(
  context: BrowserOperationContext,
  options: BrowserSelectOptionOptions,
): Promise<BrowserWidgetActionResult> {
  return runBrowserWidgetAction(context, options, {
    type: 'select-option',
    valueLength: options.optionText.length,
    async perform(session) {
      const opened = await setWidgetPopup(session, options.selector, true);
      const option = optionSelector(opened.inspection, options.optionText);

      let isSelected: unknown;
      try {
        isSelected = await session.page
          .locator(option)
          .evaluate(readOptionSelected, undefined, { timeout: session.actionTimeoutMs });
      } catch (error) {
        throw new QaError(
          'BROWSER_WIDGET_OPTION_NOT_FOUND',
          `No option "${options.optionText}" appeared in the popup of "${options.selector}" within ${String(session.actionTimeoutMs)} ms`,
          {
            cause: error,
            remediation:
              'Check the option text against the list, including case; a list loaded on demand may need a longer environment actionTimeoutMs.',
          },
        );
      }
      if (isSelected !== 'true') {
        await session.page.click(option, { timeout: session.actionTimeoutMs });
        await waitForBusyToClear(session);
      }

      const closed = await setWidgetPopup(session, options.selector, false);
      await verifyDisplayedText(session, closed, options.selector, options.optionText);
    },
  });
}
