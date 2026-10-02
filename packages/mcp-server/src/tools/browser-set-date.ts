// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { runBrowserSetDate } from '@qa-ai-stlc/core';
import { z } from 'zod';
import {
  toBrowserOperationContext,
  toElementTarget,
  type BrowserToolDependencies,
} from './browser-dependencies.js';
import { WidgetActionInputSchema, WidgetActionOutputSchema } from './browser-widget-schema.js';
import type { ToolDefinition } from '../tool.js';

const InputSchema = WidgetActionInputSchema.extend({
  value: z.string().min(1).describe("The date in the widget's own format, as a person would type it."),
});

/** `qa.browser_set_date` (P6-43): types a date into a date picker. */
export function createBrowserSetDateTool(
  dependencies: BrowserToolDependencies,
): ToolDefinition<typeof InputSchema, typeof WidgetActionOutputSchema> {
  return {
    name: 'qa.browser_set_date',
    description:
      'Types a date into a date picker and checks the picker still holds it. Use the format the ' +
      'picker displays. Fails with BROWSER_WIDGET_VALUE_MISMATCH when the picker rejects or ' +
      'rewrites the date, which can be a real defect. The date is not recorded, only its length.',
    inputSchema: InputSchema,
    outputSchema: WidgetActionOutputSchema,
    handler: (input) =>
      runBrowserSetDate(toBrowserOperationContext(dependencies), {
        sessionId: input.sessionId,
        ...toElementTarget(input),
        value: input.value,
        ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      }),
  };
}
