// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { FakeLocatorEvaluateCall } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { describe, expect, it } from 'vitest';
import { selectNativeOption } from './browser-native-select.js';
import { runBrowserOpen } from './operations/browser-open.js';
import { createBrowserTestHarness } from './test-support/browser-session-harness.js';

function select(isMultiple: boolean, selectedLabels: string[]): unknown {
  return { isMultiple, optionLabels: ['Low', 'Medium', 'High'], selectedLabels };
}

/** Answers each look at the select with the next reading; the last one repeats. */
async function openWith(readings: unknown[]) {
  let reads = 0;
  const harness = createBrowserTestHarness({
    launcherOptions: {
      locatorEvaluate: ({ functionName }: FakeLocatorEvaluateCall) => {
        if (functionName !== 'inspectNativeSelect') {
          return undefined;
        }
        const reading = readings[Math.min(reads, readings.length - 1)];
        reads += 1;
        return reading;
      },
    },
  });
  const { sessionId } = await runBrowserOpen(harness.context);
  const session = await harness.context.sessions.get(sessionId);
  return { harness, session };
}

describe('selectNativeOption', () => {
  it('picks the option by its label and confirms the select now has it chosen', async () => {
    const { harness, session } = await openWith([select(false, ['Low']), select(false, ['High'])]);

    const isNative = await selectNativeOption(session, '#priority', 'High');

    expect(isNative).toBe(true);
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'selectOption')).toEqual([
      { method: 'selectOption', args: ['#priority', [{ label: 'High' }], { timeout: 30_000 }] },
    ]);
  });

  it('keeps what a multi-select already has chosen, without repeating an option', async () => {
    const { harness, session } = await openWith([
      select(true, ['Low', 'High']),
      select(true, ['Low', 'High']),
    ]);

    await selectNativeOption(session, '#tags', 'High');

    expect(harness.launcher.pageCalls.find((call) => call.method === 'selectOption')?.args[1]).toEqual([
      { label: 'Low' },
      { label: 'High' },
    ]);
  });

  it('touches nothing and returns false when the element is not a native select', async () => {
    const { harness, session } = await openWith([null]);

    expect(await selectNativeOption(session, 'span.k-dropdownlist', 'High')).toBe(false);
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'selectOption')).toEqual([]);
  });

  it('treats an answer that is not a select reading as not a native select', async () => {
    const { session } = await openWith(['nonsense']);

    expect(await selectNativeOption(session, '#x', 'High')).toBe(false);
  });

  it('fails with the options it has when the option is missing, and picks nothing', async () => {
    const { harness, session } = await openWith([select(false, ['Low'])]);

    const failure = await selectNativeOption(session, '#priority', 'Critical').catch(
      (caught: unknown) => caught,
    );

    expect(failure).toMatchObject({ code: 'BROWSER_WIDGET_OPTION_NOT_FOUND' });
    expect((failure as Error).message).toContain('"Low", "Medium", "High"');
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'selectOption')).toEqual([]);
  });

  it('reports a mismatch when the select does not show the choice afterwards', async () => {
    const { session } = await openWith([select(false, ['Low']), select(false, ['Low'])]);

    await expect(selectNativeOption(session, '#priority', 'High')).rejects.toMatchObject({
      code: 'BROWSER_WIDGET_VALUE_MISMATCH',
    });
  });

  it('reports a mismatch when the select is gone afterwards', async () => {
    const { session } = await openWith([select(false, ['Low']), null]);

    await expect(selectNativeOption(session, '#priority', 'High')).rejects.toMatchObject({
      code: 'BROWSER_WIDGET_VALUE_MISMATCH',
    });
  });
});
