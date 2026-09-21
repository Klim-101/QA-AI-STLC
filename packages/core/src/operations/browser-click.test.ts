// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import { runBrowserClick } from './browser-click.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';

describe('runBrowserClick', () => {
  it('clicks the selector and registers the click against the current URL', async () => {
    const harness = createBrowserTestHarness();
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/login' });

    const result = await runBrowserClick(harness.context, { sessionId, selector: '[data-testid="submit"]' });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'click')).toEqual([
      { method: 'click', args: ['[data-testid="submit"]'] },
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

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(
      runBrowserClick(harness.context, { sessionId: 'session-gone', selector: 'button' }),
    ).rejects.toMatchObject({ code: 'BROWSER_SESSION_NOT_FOUND' });
  });
});
