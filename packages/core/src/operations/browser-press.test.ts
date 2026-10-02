// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
  type BrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';
import { runBrowserPress } from './browser-press.js';
import { runBrowserSnapshot } from './browser-snapshot.js';

const PAGE_URL = 'https://staging.example.test/login';

async function openPage(
  launcherOptions: Parameters<typeof createBrowserTestHarness>[0] = {},
): Promise<{ harness: BrowserTestHarness; sessionId: string }> {
  const harness = createBrowserTestHarness(launcherOptions);
  const { sessionId } = await runBrowserOpen(harness.context);
  await runBrowserNavigate(harness.context, { sessionId, url: PAGE_URL });
  return { harness, sessionId };
}

function readRecord(harness: BrowserTestHarness, path: string): unknown {
  return JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', path))));
}

describe('runBrowserPress', () => {
  it('presses the key on the element and registers it', async () => {
    const { harness, sessionId } = await openPage();

    const result = await runBrowserPress(harness.context, {
      sessionId,
      key: 'Enter',
      selector: '#password',
      stepId: 'step-2',
    });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'press')).toEqual([
      { method: 'press', args: ['#password', 'Enter', { timeout: 30_000 }] },
    ]);
    expect(result).toMatchObject({ sessionId, key: 'Enter', selector: '#password', url: PAGE_URL });
    expect(readRecord(harness, result.evidence.path)).toEqual({
      schemaVersion: 1,
      type: 'press',
      sessionId,
      stepId: 'step-2',
      key: 'Enter',
      selector: '#password',
      url: PAGE_URL,
      at: '2026-09-21T10:00:00.000Z',
    });
  });

  it('presses on the page, whatever has focus, when no element is named', async () => {
    const { harness, sessionId } = await openPage();

    const result = await runBrowserPress(harness.context, { sessionId, key: 'Escape' });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'press')).toEqual([]);
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'keyboardPress')).toEqual([
      { method: 'keyboardPress', args: ['Escape'] },
    ]);
    expect('selector' in result).toBe(false);
    expect(readRecord(harness, result.evidence.path)).not.toHaveProperty('selector');
  });

  it('never records a lone character, which could be part of a password', async () => {
    const { harness, sessionId } = await openPage();

    const result = await runBrowserPress(harness.context, { sessionId, key: 'x', selector: '#password' });

    expect(result.key).toBe('[character]');
    expect(harness.launcher.pageCalls.find((call) => call.method === 'press')?.args[1]).toBe('x');
    const stored = String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path)));
    expect(stored).toContain('[character]');
    expect(stored).not.toContain('"x"');
  });

  it('records a chord as given', async () => {
    const { harness, sessionId } = await openPage();

    const result = await runBrowserPress(harness.context, { sessionId, key: 'Control+a' });

    expect(result.key).toBe('Control+a');
  });

  it('names the element by a snapshot ref and records both', async () => {
    const { harness, sessionId } = await openPage({
      launcherOptions: {
        ariaSnapshotResult: { role: 'document', children: [{ role: 'textbox', name: 'Email' }] },
      },
    });
    await runBrowserSnapshot(harness.context, { sessionId });

    const result = await runBrowserPress(harness.context, { sessionId, key: 'Tab', ref: 'e1' });

    expect(result.selector).toBe('role=textbox[name="Email"s]');
    expect(readRecord(harness, result.evidence.path)).toMatchObject({
      selector: 'role=textbox[name="Email"s]',
      ref: { id: 'e1', role: 'textbox', name: 'Email' },
    });
  });

  it('waits for busy indicators to clear before and after the key press', async () => {
    const { harness, sessionId } = await openPage({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}ui: { busySelectors: [".mask"] }\n`,
      launcherOptions: { evaluateResult: null },
    });

    await runBrowserPress(harness.context, { sessionId, key: 'Enter' });

    expect(
      harness.launcher.pageCalls
        .map((call) => call.method)
        .filter((method) => method === 'evaluate' || method === 'keyboardPress')
        .slice(-3),
    ).toEqual(['evaluate', 'keyboardPress', 'evaluate']);
  });

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(
      runBrowserPress(harness.context, { sessionId: 'session-gone', key: 'Enter' }),
    ).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
  });
});
