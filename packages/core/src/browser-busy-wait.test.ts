// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { waitForBusyToClear } from './browser-busy-wait.js';
import { runBrowserOpen } from './operations/browser-open.js';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from './test-support/browser-session-harness.js';

const BUSY_CONFIG_YAML = `${BROWSER_TEST_CONFIG_YAML}ui: { busySelectors: [".mask", ".spinner"] }\n`;

async function openSession(options: Parameters<typeof createBrowserTestHarness>[0]) {
  const harness = createBrowserTestHarness(options);
  const { sessionId } = await runBrowserOpen(harness.context);
  return { harness, session: await harness.sessions.get(sessionId) };
}

describe('waitForBusyToClear', () => {
  it('does not touch the page when the session declares no busy selectors', async () => {
    const { harness, session } = await openSession({});

    await waitForBusyToClear(session);

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'evaluate')).toEqual([]);
  });

  it('polls in the page, bounded by the action timeout, and returns once nothing is busy', async () => {
    const { harness, session } = await openSession({
      configYaml: BUSY_CONFIG_YAML,
      launcherOptions: { evaluateResult: null },
    });

    await waitForBusyToClear(session);

    const [call] = harness.launcher.pageCalls.filter((entry) => entry.method === 'evaluate');
    expect(call?.args[1]).toEqual({
      busySelectors: ['.mask', '.spinner'],
      timeoutMs: 30_000,
      pollIntervalMs: 50,
    });
  });

  it('fails with BROWSER_BUSY_TIMEOUT naming the indicator that never left', async () => {
    const { session } = await openSession({
      configYaml: BUSY_CONFIG_YAML,
      launcherOptions: { evaluateResult: '.spinner' },
    });

    await expect(waitForBusyToClear(session)).rejects.toMatchObject({
      code: 'BROWSER_BUSY_TIMEOUT',
      message: '".spinner" was still on the page after 30000 ms',
    });
  });

  it('does not read an unexpected page answer as a settled page', async () => {
    const { session } = await openSession({ configYaml: BUSY_CONFIG_YAML });

    await expect(waitForBusyToClear(session)).rejects.toMatchObject({
      code: 'BROWSER_BUSY_TIMEOUT',
      message: '".mask, .spinner" was still on the page after 30000 ms',
    });
  });
});
