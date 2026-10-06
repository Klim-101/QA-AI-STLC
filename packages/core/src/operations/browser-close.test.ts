// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RouteHandler } from '../ports/browser-launcher.js';
import {
  BROWSER_TEST_CONFIG_YAML,
  createBrowserTestHarness,
} from '../test-support/browser-session-harness.js';
import { runBrowserClose } from './browser-close.js';
import { runBrowserOpen } from './browser-open.js';

describe('runBrowserClose', () => {
  it('records the close and shuts the session down', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserClose(harness.context, { sessionId });

    expect(result).toMatchObject({ sessionId, runId: 'run-1-2', blockedRequests: [] });
    expect(JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence.path))))).toEqual({
      schemaVersion: 1,
      type: 'close',
      sessionId,
      url: 'about:blank',
      at: '2026-09-21T10:00:00.000Z',
    });
    expect(harness.sessions.sessionIds).toEqual([]);
    expect(harness.launcher.closedBrowsers).toBe(1);
  });

  it('reports every non-GET request safe mode blocked during the session', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);
    const routeCall = harness.launcher.pageCalls.find((call) => call.method === 'contextRoute');
    const handler = routeCall?.args[1] as RouteHandler;
    await handler({
      request: () => ({ method: () => 'POST', url: () => 'https://staging.example.test/orders' }),
      abort: () => Promise.resolve(),
      continue: () => Promise.resolve(),
    });

    const result = await runBrowserClose(harness.context, { sessionId });

    expect(result.blockedRequests).toEqual([{ method: 'POST', url: 'https://staging.example.test/orders' }]);
  });

  it('closes the browser even when the closing record could not be registered', async () => {
    const harness = createBrowserTestHarness({
      launcherOptions: { initialUrl: 'https://s.test/?t=eyJh.eyJz.SflK' },
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    await expect(runBrowserClose(harness.context, { sessionId })).rejects.toMatchObject({
      code: 'BROWSER_EVIDENCE_QUARANTINED',
    });

    expect(harness.sessions.sessionIds).toEqual([]);
    expect(harness.launcher.closedBrowsers).toBe(1);
  });

  it('reports, by method and path, what the environment let through and what it blocked (ADR-0014)', async () => {
    const harness = createBrowserTestHarness({
      configYaml: BROWSER_TEST_CONFIG_YAML.replace(
        '"staging.example.test"] }',
        '"staging.example.test"], safeNonGetRequests: [{ method: POST, path: /auth/refresh-token, reason: "Exchanges the refresh cookie." }] }',
      ),
    });
    const { sessionId } = await runBrowserOpen(harness.context);
    const routeCall = harness.launcher.pageCalls.find((call) => call.method === 'contextRoute');
    const handler = routeCall?.args[1] as RouteHandler;
    const send = (method: string, url: string): Promise<void> | void =>
      handler({
        request: () => ({ method: () => method, url: () => url }),
        abort: () => Promise.resolve(),
        continue: () => Promise.resolve(),
      });
    await send('POST', 'https://staging.example.test/auth/refresh-token');
    await send('POST', 'https://staging.example.test/auth/refresh-token');
    await send('POST', 'https://staging.example.test/orders?token=secret');

    const result = await runBrowserClose(harness.context, { sessionId });

    expect(result.requests).toEqual({
      allowed: [{ method: 'POST', path: '/auth/refresh-token', count: 2 }],
      blocked: [{ method: 'POST', path: '/orders', count: 1 }],
    });
    expect(result.blockedRequests).toHaveLength(1);
  });

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(runBrowserClose(harness.context, { sessionId: 'session-gone' })).rejects.toMatchObject({
      code: 'BROWSER_SESSION_NOT_FOUND',
    });
  });
});
