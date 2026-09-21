// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashContent } from '../hash.js';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';
import { runBrowserSnapshot } from './browser-snapshot.js';

const SCREENSHOT_BYTES = new TextEncoder().encode('png-bytes-for-the-staging-home-page');

describe('runBrowserSnapshot', () => {
  it('registers both the screenshot and the accessibility tree before returning', async () => {
    const harness = createBrowserTestHarness({
      launcherOptions: {
        screenshotBytes: SCREENSHOT_BYTES,
        ariaSnapshotResult: { role: 'document', name: 'Staging home' },
        title: 'Staging home',
      },
    });
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/' });

    const result = await runBrowserSnapshot(harness.context, { sessionId });

    expect(result.screenshot).toMatchObject({
      kind: 'screenshot',
      runId: 'run-1-2',
      path: `evidence/run-1-2/${result.screenshot.id}.png`,
      sha256: hashContent(SCREENSHOT_BYTES),
    });
    expect(result.accessibilityTree).toMatchObject({
      kind: 'other',
      runId: 'run-1-2',
      path: `evidence/run-1-2/${result.accessibilityTree.id}.json`,
    });
    expect(result.title).toBe('Staging home');
  });

  it('cannot produce a screenshot that is not on disk under the run', async () => {
    const harness = createBrowserTestHarness({
      launcherOptions: { screenshotBytes: SCREENSHOT_BYTES },
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    const result = await runBrowserSnapshot(harness.context, { sessionId });

    const stored = harness.fs.getRawFile(join('project', '.qa', result.screenshot.path));
    expect(stored).toEqual(SCREENSHOT_BYTES);
    const manifest: unknown = JSON.parse(
      String(harness.fs.getRawFile(join('project', '.qa', 'manifest.json'))),
    );
    expect(manifest).toMatchObject({
      artifacts: { [result.screenshot.path]: { sha256: hashContent(SCREENSHOT_BYTES) } },
    });
  });

  it('stores the tree exactly as the page reported it, with the page URL and capture time', async () => {
    const harness = createBrowserTestHarness({
      launcherOptions: { ariaSnapshotResult: { role: 'heading', name: 'Welcome' } },
    });
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserNavigate(harness.context, { sessionId, url: 'https://staging.example.test/home' });

    const result = await runBrowserSnapshot(harness.context, { sessionId, fullPage: true });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'screenshot')).toEqual([
      { method: 'screenshot', args: [{ fullPage: true }] },
    ]);
    expect(
      JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.accessibilityTree.path)))),
    ).toEqual({
      sessionId,
      url: 'https://staging.example.test/home',
      capturedAt: '2026-09-21T10:00:00.000Z',
      tree: { role: 'heading', name: 'Welcome' },
    });
  });

  it('fails instead of returning a snapshot whose tree leaked a secret', async () => {
    const harness = createBrowserTestHarness({
      launcherOptions: { ariaSnapshotResult: { role: 'text', name: 'Bearer abcdefghijklmnopqrstuvwx' } },
    });
    const { sessionId } = await runBrowserOpen(harness.context);

    await expect(runBrowserSnapshot(harness.context, { sessionId })).rejects.toMatchObject({
      code: 'BROWSER_EVIDENCE_QUARANTINED',
    });
  });

  it('rejects an unknown session', async () => {
    const harness = createBrowserTestHarness();

    await expect(runBrowserSnapshot(harness.context, { sessionId: 'session-gone' })).rejects.toMatchObject({
      code: 'BROWSER_SESSION_NOT_FOUND',
    });
  });
});
