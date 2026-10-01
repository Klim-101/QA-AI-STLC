// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import { runBrowserClick } from './browser-click.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';

describe('runBrowserClick', () => {
  it('waits for busy indicators to clear before and after the click (P6-42)', async () => {
    const harness = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}ui: { busySelectors: [".mask"] }
`,
      launcherOptions: { evaluateResult: null },
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    await runBrowserClick(harness.context, { sessionId, selector: '#save' });

    expect(
      harness.launcher.pageCalls
        .map((call) => call.method)
        .filter((method) => method === 'evaluate' || method === 'click'),
    ).toEqual(['evaluate', 'click', 'evaluate']);
  });

  it('does not click while an indicator never clears, and reports a coded error (P6-42)', async () => {
    const harness = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}ui: { busySelectors: [".mask"] }
`,
      launcherOptions: { evaluateResult: '.mask' },
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    await expect(runBrowserClick(harness.context, { sessionId, selector: '#save' })).rejects.toMatchObject({
      code: 'BROWSER_BUSY_TIMEOUT',
    });
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'click')).toEqual([]);
  });

  it('clicks the selector and registers the click against the current URL', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/login' });

    const result = await runBrowserClick(harness.context, { sessionId, selector: '[data-testid="submit"]' });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'click')).toEqual([
      { method: 'click', args: ['[data-testid="submit"]', { timeout: 30_000 }] },
    ]);
    expect(result).toMatchObject({
      sessionId,
      selector: '[data-testid="submit"]',
      url: 'https://staging.example.test/login',
    });
    expect(JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))))).toEqual({
      schemaVersion: 1,
      type: 'click',
      sessionId,
      selector: '[data-testid="submit"]',
      url: 'https://staging.example.test/login',
      at: '2026-09-21T10:00:00.000Z',
    });
  });

  it('carries a stepId into the recorded evidence, for qa-generate-tests (P3-07) to recover later', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/login' });

    const result = await runBrowserClick(harness.context, {
      sessionId,
      selector: '[data-testid="submit"]',
      stepId: 'step-2',
    });

    const written = JSON.parse(
      String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))),
    ) as { stepId?: string };
    expect(written.stepId).toBe('step-2');
  });

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(
      runBrowserClick(harness.context, { sessionId: 'session-gone', selector: 'button' }),
    ).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
  });

  it("honors the environment's configured actionTimeoutMs (P6-23), overriding Playwright's default", async () => {
    const harness = createBrowserTestHarness({
      configYaml: BROWSER_TEST_CONFIG_YAML.replace(
        '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
        '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"], actionTimeoutMs: 5000 }',
      ),
    });
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/login' });

    await runBrowserClick(harness.context, { sessionId, selector: '[data-testid="submit"]' });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'click')).toEqual([
      { method: 'click', args: ['[data-testid="submit"]', { timeout: 5000 }] },
    ]);
  });
});
