// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RouteHandler } from '../ports/browser-launcher.js';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
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
    const routeCall = harness.launcher.pageCalls.find((call) => call.method === 'route');
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

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(runBrowserClose(harness.context, { sessionId: 'session-gone' })).rejects.toMatchObject({
      code: 'BROWSER_SESSION_NOT_FOUND',
    });
  });
});
