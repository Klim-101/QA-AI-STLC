// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserSelectOption } from '@qa-ai-stlc/core';
import { z } from 'zod';
import {
  toBrowserOperationContext,
  toElementTarget,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import { WidgetActionInputSchema, WidgetActionOutputSchema } from './browser-widget-schema.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = WidgetActionInputSchema.extend({
  optionText: z.string().min(1).describe("The option's visible text, exactly as the list shows it."),
});

/** `qa.browser_select_option` (P6-43): picks one option of a list widget by its visible text. */
export function createBrowserSelectOptionTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof WidgetActionOutputSchema> {
  return {
    name: 'qa.browser_select_option',
    description:
      'Picks the option with the given visible text in a drop-down, combo box or multi-select, ' +
      'and checks the widget shows it afterwards. Use instead of a click sequence on a component ' +
      'library widget. Fails with BROWSER_WIDGET_OPTION_NOT_FOUND when the list has no such ' +
      'option and BROWSER_WIDGET_VALUE_MISMATCH when the widget does not take the choice, which ' +
      'can be a real defect. The text is not recorded, only its length.',
    inputSchema: InputSchema,
    outputSchema: WidgetActionOutputSchema,
    handler: (input) =>
      runBrowserSelectOption(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...toElementTarget(input),
        optionText: input.optionText,
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
