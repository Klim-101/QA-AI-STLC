// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import { runBrowserHover } from './browser-hover.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';
import { runBrowserSnapshot } from './browser-snapshot.js';

const PAGE_URL = 'https://staging.example.test/tasks';

describe('runBrowserHover', () => {
  it('hovers the selector and registers the hover against the current URL', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserNavigate(harness.context, { sessionId, url: PAGE_URL });

    const result = await runBrowserHover(harness.context, { sessionId, selector: '#menu', stepId: 'step-1' });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'hover')).toEqual([
      { method: 'hover', args: ['#menu', { timeout: 30_000 }] },
    ]);
    expect(result).toMatchObject({ sessionId, selector: '#menu', url: PAGE_URL });
    expect(JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))))).toEqual({
      schemaVersion: 1,
      type: 'hover',
      sessionId,
      stepId: 'step-1',
      selector: '#menu',
      url: PAGE_URL,
      at: '2026-09-21T10:00:00.000Z',
    });
  });

  it('names the element by a snapshot ref and records both', async () => {
    const harness = createBrowserTestHarness({
      launcherOptions: {
        ariaSnapshotResult: { role: 'document', children: [{ role: 'button', name: 'Menu' }] },
      },
    });
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserSnapshot(harness.context, { sessionId });

    const result = await runBrowserHover(harness.context, { sessionId, ref: 'e1' });

    expect(result.selector).toBe('role=button[name="Menu"s]');
    expect(
      JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path)))),
    ).toMatchObject({ ref: { id: 'e1', role: 'button', name: 'Menu' } });
  });

  it('does not hover while an indicator never clears, and reports a coded error', async () => {
    const harness = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}ui: { busySelectors: [".mask"] }\n`,
      launcherOptions: { evaluateResult: '.mask' },
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    await expect(runBrowserHover(harness.context, { sessionId, selector: '#menu' })).rejects.toMatchObject({
      code: 'BROWSER_BUSY_TIMEOUT',
    });
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'hover')).toEqual([]);
  });
});
