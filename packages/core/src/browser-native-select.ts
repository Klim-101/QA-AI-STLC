// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import type { BrowserSession } from './browser-session-store.js';
import { valueMismatch } from './browser-widget.js';
import { inspectNativeSelect } from './browser-widget-page.js';
import { QaError } from './errors.js';

const NativeSelectSchema = z.object({
  isMultiple: z.boolean(),
  optionLabels: z.array(z.string()),
  selectedLabels: z.array(z.string()),
});
type NativeSelect = z.infer<typeof NativeSelectSchema>;

async function readNativeSelect(session: BrowserSession, selector: string): Promise<NativeSelect | null> {
  const reading = await session.page
    .locator(selector)
    .evaluate(inspectNativeSelect, undefined, { timeout: session.actionTimeoutMs });
  // Anything that is not a select reading is treated as "not a native select": the widget path
  // then reports what it finds, instead of this one guessing.
  const parsed = NativeSelectSchema.safeParse(reading);
  return parsed.success ? parsed.data : null;
}

/**
 * Picks the option with the given visible text when `selector` is a native select. Returns false,
 * having touched nothing, when it is not one, so the caller goes on to treat it as a widget. A
 * multi-select keeps what it already had chosen, as picking an option of a widget list does.
 */
export async function selectNativeOption(
  session: BrowserSession,
  selector: string,
  optionText: string,
): Promise<boolean> {
  const before = await readNativeSelect(session, selector);
  if (before === null) {
    return false;
  }
  if (!before.optionLabels.includes(optionText)) {
    throw new QaError(
      'BROWSER_WIDGET_OPTION_NOT_FOUND',
      `"${selector}" has no option "${optionText}"; it offers ${before.optionLabels.map((label) => `"${label}"`).join(', ')}`,
      { remediation: 'Check the option text against the list, including case.' },
    );
  }
  const labels = before.isMultiple ? [...new Set([...before.selectedLabels, optionText])] : [optionText];
  await session.page.selectOption(
    selector,
    labels.map((label) => ({ label })),
    { timeout: session.actionTimeoutMs },
  );

  const after = await readNativeSelect(session, selector);
  if (!after?.selectedLabels.includes(optionText)) {
    throw valueMismatch(selector, optionText, after?.selectedLabels.join(', ') ?? '');
  }
  return true;
}
