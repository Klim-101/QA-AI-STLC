// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { FakeLocatorEvaluateCall } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { describe, expect, it } from 'vitest';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import { runBrowserCheck } from './browser-check.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';
import { runBrowserSnapshot } from './browser-snapshot.js';

const PAGE_URL = 'https://staging.example.test/tasks/new';

function reading(checked: boolean | null): unknown {
  return { visible: true, text: '', value: null, checked, inputType: 'checkbox' };
}

async function openPage(shown: unknown) {
  const harness = createBrowserTestHarness({
    launcherOptions: {
      ariaSnapshotResult: { role: 'document', children: [{ role: 'checkbox', name: 'Agree' }] },
      locatorEvaluate: ({ functionName }: FakeLocatorEvaluateCall) =>
        functionName === 'readElementState' ? shown : undefined,
    },
  });
  const { sessionId } = await runBrowserOpen(harness.context);
  await runBrowserNavigate(harness.context, { sessionId, url: PAGE_URL });
  return { harness, sessionId };
}

describe('runBrowserCheck', () => {
  it('checks the box by default, reads it back and registers the state', async () => {
    const { harness, sessionId } = await openPage(reading(true));

    const result = await runBrowserCheck(harness.context, {
      sessionId,
      selector: '#agree',
      stepId: 'step-3',
    });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'setChecked')).toEqual([
      { method: 'setChecked', args: ['#agree', true, { timeout: 30_000 }] },
    ]);
    expect(result).toMatchObject({ sessionId, selector: '#agree', checked: true, url: PAGE_URL });
    expect(JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))))).toEqual({
      schemaVersion: 1,
      type: 'check',
      sessionId,
      stepId: 'step-3',
      selector: '#agree',
      checked: true,
      url: PAGE_URL,
      at: '2026-09-21T10:00:00.000Z',
    });
  });

  it('unchecks a box when asked', async () => {
    const { harness, sessionId } = await openPage(reading(false));

    const result = await runBrowserCheck(harness.context, { sessionId, selector: '#agree', checked: false });

    expect(harness.launcher.pageCalls.find((call) => call.method === 'setChecked')?.args[1]).toBe(false);
    expect(result.checked).toBe(false);
  });

  it('names the box by a snapshot ref and records both', async () => {
    const { harness, sessionId } = await openPage(reading(true));
    await runBrowserSnapshot(harness.context, { sessionId });

    const result = await runBrowserCheck(harness.context, { sessionId, ref: 'e1' });

    expect(result.selector).toBe('role=checkbox[name="Agree"s]');
    expect(
      JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path)))),
    ).toMatchObject({ ref: { id: 'e1', role: 'checkbox', name: 'Agree' } });
  });

  it('fails when the page leaves the box in the other state', async () => {
    const { harness, sessionId } = await openPage(reading(false));

    const failure = await runBrowserCheck(harness.context, { sessionId, selector: '#agree' }).catch(
      (caught: unknown) => caught,
    );

    expect(failure).toMatchObject({ code: 'BROWSER_CHECK_NOT_APPLIED' });
    expect((failure as Error).message).toContain('checked: false');
  });

  it('fails when the element shows no checked state at all', async () => {
    const { harness, sessionId } = await openPage(reading(null));

    const failure = await runBrowserCheck(harness.context, { sessionId, selector: 'h1' }).catch(
      (caught: unknown) => caught,
    );

    expect(failure).toMatchObject({ code: 'BROWSER_CHECK_NOT_APPLIED' });
    expect((failure as Error).message).toContain('no checked state');
  });

  it('fails when the page answers with something that is not a reading', async () => {
    const { harness, sessionId } = await openPage('nonsense');

    await expect(runBrowserCheck(harness.context, { sessionId, selector: '#agree' })).rejects.toMatchObject({
      code: 'BROWSER_CHECK_NOT_APPLIED',
    });
  });
});
