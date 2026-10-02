// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserClosePopup, runBrowserOpenPopup } from '@qa-ai-stlc/core';
import {
  toBrowserOperationContext,
  toElementTarget,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import { WidgetActionInputSchema, WidgetActionOutputSchema } from './browser-widget-schema.js';
import type { ToolDefinition } from '../tool.js';

/** `qa.browser_open_popup` (P6-43): opens a widget's popup. */
export function createBrowserOpenPopupTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof WidgetActionInputSchema, typeof WidgetActionOutputSchema> {
  return {
    name: 'qa.browser_open_popup',
    description:
      "Opens a component library widget's popup (a list or a calendar) and checks it is open. " +
      'Safe to repeat: an open popup stays open. Fails with BROWSER_WIDGET_POPUP_STATE when it ' +
      'does not open.',
    inputSchema: WidgetActionInputSchema,
    outputSchema: WidgetActionOutputSchema,
    handler: (input) =>
      runBrowserOpenPopup(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...toElementTarget(input),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}

/** `qa.browser_close_popup` (P6-43): closes a widget's popup. */
export function createBrowserClosePopupTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof WidgetActionInputSchema, typeof WidgetActionOutputSchema> {
  return {
    name: 'qa.browser_close_popup',
    description:
      "Closes a component library widget's popup and checks it is closed. Safe to repeat: a " +
      'closed popup stays closed. Fails with BROWSER_WIDGET_POPUP_STATE when it does not close.',
    inputSchema: WidgetActionInputSchema,
    outputSchema: WidgetActionOutputSchema,
    handler: (input) =>
      runBrowserClosePopup(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...toElementTarget(input),
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
