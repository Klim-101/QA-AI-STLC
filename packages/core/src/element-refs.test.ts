// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBrowserTestHarness } from './test-support/browser-session-harness.js';
import { resolveBrowserTarget } from './element-refs.js';
import { runBrowserClick } from './operations/browser-click.js';
import { runBrowserFill } from './operations/browser-fill.js';
import { runBrowserNavigate } from './operations/browser-navigate.js';
import { runBrowserOpen } from './operations/browser-open.js';
import { runBrowserOpenPopup } from './operations/browser-popup.js';
import { runBrowserSnapshot } from './operations/browser-snapshot.js';
import { CLOSED_WIDGET, OPEN_WIDGET, scriptWidgetPage } from './test-support/widget-page-script.js';

const PAGE_URL = 'https://staging.example.test/login';
const TREE = {
  role: 'document',
  children: [{ role: 'textbox', name: 'User name' }, { role: 'button', name: 'Log in' }, { role: 'textbox' }],
};

type Harness = ReturnType<typeof createBrowserTestHarness>;

async function openSnapshotted(locatorCounts: readonly number[] = [1], tree: unknown = TREE) {
  const harness = createBrowserTestHarness({ launcherOptions: { ariaSnapshotResult: tree, locatorCounts } });
  const { sessionId } = await runBrowserOpen(harness.context);
  await runBrowserNavigate(harness.context, { sessionId, url: PAGE_URL });
  await runBrowserSnapshot(harness.context, { sessionId });
  return { harness, sessionId };
}

function readEvidence(harness: Harness, path: string): Record<string, unknown> {
  return JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', path)))) as Record<string, unknown>;
}

describe('resolveBrowserTarget', () => {
  it('passes a selector through without touching the page', async () => {
    const { harness, sessionId } = await openSnapshotted();
    const session = await harness.sessions.get(sessionId);

    await expect(resolveBrowserTarget(session, { selector: '#go' })).resolves.toEqual({ selector: '#go' });
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'locator')).toEqual([]);
  });

  it.each([{}, { selector: '#go', ref: 'e1' }])(
    'refuses %j: exactly one of selector and ref',
    async (options) => {
      const { harness, sessionId } = await openSnapshotted();
      const session = await harness.sessions.get(sessionId);

      await expect(resolveBrowserTarget(session, options)).rejects.toMatchObject({
        code: 'BROWSER_TARGET_INVALID',
      });
    },
  );

  it('turns a ref into a role and exact-name selector and names the ref it resolved', async () => {
    const { harness, sessionId } = await openSnapshotted();
    const session = await harness.sessions.get(sessionId);

    await expect(resolveBrowserTarget(session, { ref: 'e2' })).resolves.toEqual({
      selector: 'role=button[name="Log in"s]',
      ref: { id: 'e2', role: 'button', name: 'Log in' },
    });
    await expect(resolveBrowserTarget(session, { ref: 'e3' })).resolves.toEqual({
      selector: 'role=textbox',
      ref: { id: 'e3', role: 'textbox' },
    });
  });

  it('matches a name the snapshot cut as a prefix, not as a whole name', async () => {
    const longName = 'x'.repeat(250);
    const { harness, sessionId } = await openSnapshotted([1], { role: 'link', name: longName });
    const session = await harness.sessions.get(sessionId);

    const target = await resolveBrowserTarget(session, { ref: 'e1' });

    expect(target.selector).toBe(`role=link[name="${'x'.repeat(200)}"]`);
  });

  it('escapes quotes in a name', async () => {
    const { harness, sessionId } = await openSnapshotted([1], { role: 'button', name: 'Say "hi"' });
    const session = await harness.sessions.get(sessionId);

    const target = await resolveBrowserTarget(session, { ref: 'e1' });

    expect(target.selector).toBe('role=button[name="Say \\"hi\\""s]');
  });

  it('is stale before any snapshot, for a ref the snapshot never had, and after a navigation', async () => {
    const harness = createBrowserTestHarness({ launcherOptions: { ariaSnapshotResult: TREE } });
    const { sessionId } = await runBrowserOpen(harness.context);
    const session = await harness.sessions.get(sessionId);
    await expect(resolveBrowserTarget(session, { ref: 'e1' })).rejects.toMatchObject({
      code: 'BROWSER_REF_STALE',
      message: expect.stringContaining('no snapshot yet') as string,
    });

    await runBrowserSnapshot(harness.context, { sessionId });
    await expect(resolveBrowserTarget(session, { ref: 'e99' })).rejects.toMatchObject({
      code: 'BROWSER_REF_STALE',
    });

    await runBrowserNavigate(harness.context, { sessionId, url: PAGE_URL });
    await expect(resolveBrowserTarget(session, { ref: 'e1' })).rejects.toMatchObject({
      code: 'BROWSER_REF_STALE',
    });
  });

  it('is stale once the page has moved to another URL without a navigate call', async () => {
    const { harness, sessionId } = await openSnapshotted();
    const session = await harness.sessions.get(sessionId);
    await session.page.goto('https://staging.example.test/elsewhere');

    await expect(resolveBrowserTarget(session, { ref: 'e1' })).rejects.toMatchObject({
      code: 'BROWSER_REF_STALE',
      message: expect.stringContaining('moved on') as string,
    });
  });

  it.each([0, 2])('is stale when the role and name now match %i elements', async (count) => {
    const { harness, sessionId } = await openSnapshotted([count]);
    const session = await harness.sessions.get(sessionId);

    await expect(resolveBrowserTarget(session, { ref: 'e1' })).rejects.toMatchObject({
      code: 'BROWSER_REF_STALE',
      message: expect.stringContaining(`match ${String(count)} elements`) as string,
    });
  });

  it('retires every ref of an older snapshot: numbering continues instead of restarting', async () => {
    const { harness, sessionId } = await openSnapshotted();

    const second = await runBrowserSnapshot(harness.context, { sessionId });

    expect(second.view.text).toContain('[ref=e4]');
    expect(second.view.text).not.toContain('[ref=e1]');
    const session = await harness.sessions.get(sessionId);
    await expect(resolveBrowserTarget(session, { ref: 'e1' })).rejects.toMatchObject({
      code: 'BROWSER_REF_STALE',
    });
    await expect(resolveBrowserTarget(session, { ref: 'e4' })).resolves.toMatchObject({
      selector: 'role=textbox[name="User name"s]',
    });
  });
});

describe('actions that take a ref', () => {
  it('clicks the selector the ref resolved to and records the selector and the ref', async () => {
    const { harness, sessionId } = await openSnapshotted();

    const result = await runBrowserClick(harness.context, { sessionId, ref: 'e2', stepId: 'step-1' });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'click')).toEqual([
      { method: 'click', args: ['role=button[name="Log in"s]', { timeout: 30_000 }] },
    ]);
    expect(result.selector).toBe('role=button[name="Log in"s]');
    expect(readEvidence(harness, result.evidence.path)).toMatchObject({
      type: 'click',
      selector: 'role=button[name="Log in"s]',
      ref: { id: 'e2', role: 'button', name: 'Log in' },
      stepId: 'step-1',
    });
  });

  it('fills by ref and still records only the length of the value', async () => {
    const { harness, sessionId } = await openSnapshotted();

    const result = await runBrowserFill(harness.context, { sessionId, ref: 'e1', value: 'casey' });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'fill')).toEqual([
      { method: 'fill', args: ['role=textbox[name="User name"s]', 'casey', { timeout: 30_000 }] },
    ]);
    const record = readEvidence(harness, result.evidence.path);
    expect(record).toMatchObject({ valueLength: 5, ref: { id: 'e1' } });
    expect(JSON.stringify(record)).not.toContain('casey');
  });

  it('does not act, and records nothing, on a stale ref', async () => {
    const { harness, sessionId } = await openSnapshotted();
    await runBrowserNavigate(harness.context, { sessionId, url: PAGE_URL });
    const { runId } = await harness.sessions.get(sessionId);
    const directory = join('project', '.qa', 'evidence', runId);
    const before = await harness.fs.listFiles(directory);

    await expect(runBrowserClick(harness.context, { sessionId, ref: 'e2' })).rejects.toMatchObject({
      code: 'BROWSER_REF_STALE',
    });

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'click')).toEqual([]);
    expect(await harness.fs.listFiles(directory)).toEqual(before);
  });

  it('opens a widget popup addressed by ref, through the shared widget action', async () => {
    const harness = createBrowserTestHarness({
      launcherOptions: {
        ariaSnapshotResult: { role: 'combobox', name: 'Status' },
        locatorEvaluate: scriptWidgetPage({ inspections: [CLOSED_WIDGET, OPEN_WIDGET] }),
      },
    });
    const { sessionId } = await runBrowserOpen(harness.context);
    await runBrowserSnapshot(harness.context, { sessionId });

    const result = await runBrowserOpenPopup(harness.context, { sessionId, ref: 'e1' });

    expect(result.selector).toBe('role=combobox[name="Status"s]');
    expect(readEvidence(harness, result.evidence.path)).toMatchObject({
      type: 'open-popup',
      selector: 'role=combobox[name="Status"s]',
      ref: { id: 'e1', role: 'combobox', name: 'Status' },
    });
  });
});
