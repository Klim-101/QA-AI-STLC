// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';

describe('runBrowserNavigate', () => {
  it('waits for busy indicators to clear once the page has loaded (P6-42)', async () => {
    const harness = createBrowserTestHarness({
      configYaml: `${BROWSER_TEST_CONFIG_YAML}ui: { busySelectors: [".mask"] }
`,
      launcherOptions: { evaluateResult: null },
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/' });

    expect(
      harness.launcher.pageCalls
        .map((call) => call.method)
        .filter((method) => method === 'goto' || method === 'evaluate'),
    ).toEqual(['goto', 'evaluate']);
  });

  it('navigates an open session and registers the navigation', async () => {
    const harness = createBrowserTestHarness({ launcherOptions: { title: 'Staging home' } });
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserNavigate(harness.context, {
      sessionId,
      url: 'https://staging.example.test/login',
    });

    expect(result).toMatchObject({
      sessionId,
      url: 'https://staging.example.test/login',
      title: 'Staging home',
      httpStatus: 200,
    });
    expect(result.evidence.kind).toBe('action');
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'goto')).toEqual([
      { method: 'goto', args: ['https://staging.example.test/login', { timeout: 30_000 }] },
    ]);
    expect(JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))))).toEqual({
      schemaVersion: 1,
      type: 'navigate',
      sessionId,
      url: 'https://staging.example.test/login',
      httpStatus: 200,
      at: '2026-09-21T10:00:00.000Z',
    });
  });

  it('refuses a host that is not on the session allowlist, without requesting it', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);
    const callsBefore = harness.launcher.pageCalls.length;

    await expect(
      runBrowserNavigate(harness.context, { sessionId, url: 'https://evil.test/' }),
    ).rejects.toMatchObject({ code: 'BROWSER_URL_NOT_ALLOWED' });

    expect(harness.launcher.pageCalls).toHaveLength(callsBefore);
  });

  it('omits the status when the navigation produced no response', async () => {
    const harness = createBrowserTestHarness({ launcherOptions: { gotoResponse: null } });
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserNavigate(harness.context, {
      sessionId,
      url: 'https://staging.example.test/',
    });

    expect(result.httpStatus).toBeUndefined();
    expect(
      JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path)))),
    ).not.toHaveProperty('httpStatus');
  });

  it('carries a stepId into the recorded evidence, for qa-generate-tests (P3-07) to recover later', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserNavigate(harness.context, {
      sessionId,
      url: 'https://staging.example.test/login',
      stepId: 'step-1',
    });

    const written = JSON.parse(
      String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))),
    ) as { stepId?: string };
    expect(written.stepId).toBe('step-1');
  });

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(
      runBrowserNavigate(harness.context, {
        sessionId: 'session-gone',
        url: 'https://staging.example.test/',
      }),
    ).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
  });

  it("honors the environment's configured navigationTimeoutMs (P6-23), overriding Playwright's default", async () => {
    const harness = createBrowserTestHarness({
      configYaml: BROWSER_TEST_CONFIG_YAML.replace(
        '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
        '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"], navigationTimeoutMs: 5000 }',
      ),
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/login' });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'goto')).toEqual([
      { method: 'goto', args: ['https://staging.example.test/login', { timeout: 5000 }] },
    ]);
  });
});
