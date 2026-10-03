// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LogMeta, Logger } from '../ports/logger.js';
import { createBrowserTestHarness } from '../test-support/browser-session-harness.js';
import { runBrowserClick } from './browser-click.js';
import { runBrowserClose } from './browser-close.js';
import { runBrowserNavigate } from './browser-navigate.js';
import { runBrowserOpen } from './browser-open.js';
import { runBrowserTabs } from './browser-tabs.js';

interface LoggedError {
  readonly message: string;
  readonly meta: LogMeta | undefined;
}

function recordingLogger(errors: LoggedError[]): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (message, meta) => {
      errors.push({ message, meta });
    },
  };
}

async function openHarness(options: Parameters<typeof runBrowserOpen>[1] = {}) {
  const harness = createBrowserTestHarness();
  const errors: LoggedError[] = [];
  const context = {
    ...harness.context,
    engine: { ...harness.context.engine, logger: recordingLogger(errors) },
  };
  const { sessionId } = await runBrowserOpen(context, options);
  return { harness, context, sessionId, errors };
}

async function evidenceTypes(harness: ReturnType<typeof createBrowserTestHarness>): Promise<string[]> {
  const types: string[] = [];
  for (const path of await harness.fs.listFiles(join('project', '.qa', 'evidence'))) {
    if (path.endsWith('.json')) {
      const record = JSON.parse(String(harness.fs.getRawFile(path))) as { type?: string };
      if (record.type !== undefined) {
        types.push(record.type);
      }
    }
  }
  return types.sort();
}

const ALLOWED_URL = 'https://staging.example.test/second';

describe('dialogs (P6-59)', () => {
  it('dismisses a confirm, reports it in the result of the click and records it as evidence', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.raiseDialog('confirm', 'Delete everything?');

    const result = await runBrowserClick(context, { sessionId, selector: '#delete' });

    expect(harness.launcher.dialogOutcomes).toEqual([
      { type: 'confirm', message: 'Delete everything?', action: 'dismissed' },
    ]);
    expect(result.notices).toEqual([
      {
        kind: 'dialog',
        tabId: 'tab-1',
        dialogKind: 'confirm',
        message: 'Delete everything?',
        handled: 'dismissed',
      },
    ]);
    expect(await evidenceTypes(harness)).toEqual(['click', 'dialog', 'open']);
    // Reported once.
    expect((await runBrowserClick(context, { sessionId, selector: '#delete' })).notices).toBeUndefined();
  });

  it('records the dialog with the time it happened, not the time it was written', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.raiseDialog('alert', 'Saved');
    await runBrowserTabs(context, { sessionId, settleMs: 0 });

    const dialogPath = (await harness.fs.listFiles(join('project', '.qa', 'evidence'))).find(
      (path) => path.endsWith('.json') && String(harness.fs.getRawFile(path)).includes('"dialog"'),
    );
    expect(JSON.parse(String(harness.fs.getRawFile(dialogPath ?? ''))) as unknown).toMatchObject({
      type: 'dialog',
      tabId: 'tab-1',
      dialog: { kind: 'alert', message: 'Saved', handled: 'dismissed' },
      at: '2026-09-21T10:00:00.000Z',
    });
  });

  it('accepts dialogs when the session is opened with that policy', async () => {
    const { harness, context, sessionId } = await openHarness({ dialogPolicy: 'accept' });
    harness.launcher.raiseDialog('prompt', 'Name?');

    const result = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(harness.launcher.dialogOutcomes).toEqual([
      { type: 'prompt', message: 'Name?', action: 'accepted' },
    ]);
    expect(result.notices).toMatchObject([{ kind: 'dialog', dialogKind: 'prompt', handled: 'accepted' }]);
  });

  it('caps the dialog message, which is page-controlled text', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.raiseDialog('alert', 'x'.repeat(500));

    const result = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(result.notices).toMatchObject([{ message: `${'x'.repeat(200)}…` }]);
  });

  it('reports a dialog type it does not know as an alert', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.raiseDialog('beforeunload', 'Leave?');
    harness.launcher.raiseDialog('banner', 'Hello');

    const result = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(result.notices).toMatchObject([{ dialogKind: 'beforeunload' }, { dialogKind: 'alert' }]);
  });

  it('logs a dialog it could not handle and reports nothing for it', async () => {
    const { harness, context, sessionId, errors } = await openHarness();
    // A page that is already gone rejects the dismissal.
    harness.launcher.failDialogsWith(new Error('page closed'));
    harness.launcher.raiseDialog('alert', 'x');

    const result = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(result.notices).toEqual([]);
    expect(errors).toMatchObject([{ meta: { code: 'BROWSER_DIALOG_FAILED' } }]);
  });

  it('logs and carries on when handling throws something that is not an Error', async () => {
    const { harness, context, sessionId, errors } = await openHarness();
    harness.launcher.failDialogsWith('page closed');
    harness.launcher.raiseDialog('alert', 'x');

    await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(errors).toMatchObject([{ meta: { code: 'BROWSER_DIALOG_FAILED', error: 'page closed' } }]);
  });

  it('logs work in an event handler that fails outright instead of letting it escape', async () => {
    const { harness, context, sessionId, errors } = await openHarness();
    harness.launcher.breakDialogMessages(new Error('detached'));
    harness.launcher.raiseDialog('alert', 'x');

    const result = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(result.notices).toEqual([]);
    expect(errors).toMatchObject([{ meta: { code: 'BROWSER_TAB_HANDLING_FAILED', error: 'detached' } }]);
  });

  it('logs a failure that is not an Error the same way', async () => {
    const { harness, context, sessionId, errors } = await openHarness();
    harness.launcher.breakDialogMessages('detached');
    harness.launcher.raiseDialog('alert', 'x');

    await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(errors).toMatchObject([{ meta: { code: 'BROWSER_TAB_HANDLING_FAILED', error: 'detached' } }]);
  });

  it('writes what a session handled before closing, so closing loses nothing', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.raiseDialog('alert', 'Bye');

    await runBrowserClose(context, { sessionId });

    expect(await evidenceTypes(harness)).toEqual(['close', 'dialog', 'open']);
  });
});

describe('tabs (P6-59)', () => {
  it('routes every page of the session through safe mode from the context, so a popup is covered too', async () => {
    const { harness } = await openHarness();

    expect(harness.launcher.pageCalls.filter((call) => call.method === 'contextRoute')).toHaveLength(1);
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'route')).toEqual([]);
  });

  it('lists the first page as the only tab, and none of them is switched to by listing', async () => {
    const { context, sessionId } = await openHarness();
    await runBrowserNavigate(context, { sessionId, url: 'https://staging.example.test/login' });

    const result = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(result).toMatchObject({
      sessionId,
      activeTabId: 'tab-1',
      tabs: [{ tabId: 'tab-1', url: 'https://staging.example.test/login', title: '', active: true }],
      notices: [],
    });
    expect(result.evidence).toBeUndefined();
  });

  it('adds a page the application opened, reports it once and records it', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.openPopup(ALLOWED_URL);

    const listed = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(listed.tabs.map((tab) => [tab.tabId, tab.url, tab.active])).toEqual([
      ['tab-1', 'about:blank', true],
      ['tab-2', ALLOWED_URL, false],
    ]);
    expect(listed.notices).toEqual([{ kind: 'tab-opened', tabId: 'tab-2', url: ALLOWED_URL }]);
    expect((await runBrowserTabs(context, { sessionId, settleMs: 0 })).notices).toEqual([]);
    expect(await evidenceTypes(harness)).toEqual(['open', 'tab-opened']);
  });

  it('keeps a page that is still blank, since it has not navigated anywhere yet', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.openPopup('about:blank');

    const listed = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(listed.tabs.map((tab) => tab.tabId)).toEqual(['tab-1', 'tab-2']);
  });

  it('switches to a tab, brings it to the front, records the switch and retires the refs', async () => {
    const { harness, context, sessionId } = await openHarness();
    const popup = harness.launcher.openPopup(ALLOWED_URL);

    const result = await runBrowserTabs(context, {
      sessionId,
      switchTo: 'tab-2',
      stepId: 'step-4',
      settleMs: 0,
    });

    expect(result.activeTabId).toBe('tab-2');
    expect(result.tabs.map((tab) => tab.active)).toEqual([false, true]);
    expect(harness.launcher.pageCalls.filter((call) => call.method === 'bringToFront')).toHaveLength(1);
    expect((await harness.sessions.get(sessionId)).page).toBe(popup);
    expect(
      JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence?.path ?? '')))),
    ).toEqual({
      schemaVersion: 1,
      type: 'tab-switch',
      sessionId,
      stepId: 'step-4',
      tabId: 'tab-2',
      url: ALLOWED_URL,
      at: '2026-09-21T10:00:00.000Z',
    });
  });

  it('acts on the tab it switched to', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.openPopup(ALLOWED_URL);
    await runBrowserTabs(context, { sessionId, switchTo: 'tab-2', settleMs: 0 });

    const result = await runBrowserClick(context, { sessionId, selector: '#go' });

    expect(result.url).toBe(ALLOWED_URL);
  });

  it('records a switch without a step id when there is none', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.openPopup(ALLOWED_URL);

    const result = await runBrowserTabs(context, { sessionId, switchTo: 'tab-2', settleMs: 0 });

    expect(
      JSON.parse(String(harness.fs.getRawFile(join('project', '.qa', result.evidence?.path ?? '')))),
    ).not.toHaveProperty('stepId');
  });

  it('fails with BROWSER_TAB_NOT_FOUND for a tab that does not exist', async () => {
    const { context, sessionId } = await openHarness();

    await expect(
      runBrowserTabs(context, { sessionId, switchTo: 'tab-7', settleMs: 0 }),
    ).rejects.toMatchObject({
      code: 'BROWSER_TAB_NOT_FOUND',
    });
  });

  it('closes a page opened off the allowlist and says where it was going', async () => {
    const { harness, context, sessionId } = await openHarness();
    const popup = harness.launcher.openPopup('https://elsewhere.example.test/phish');

    const listed = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(harness.launcher.closedPages).toEqual([popup]);
    expect(listed.tabs.map((tab) => tab.tabId)).toEqual(['tab-1']);
    expect(listed.notices).toEqual([{ kind: 'tab-blocked', url: 'https://elsewhere.example.test/phish' }]);
    expect(await evidenceTypes(harness)).toEqual(['open', 'tab-blocked']);
    await expect(
      runBrowserTabs(context, { sessionId, switchTo: 'tab-2', settleMs: 0 }),
    ).rejects.toMatchObject({
      code: 'BROWSER_TAB_NOT_FOUND',
    });
  });

  it('closes a page that is off the allowlist by scheme or port as well', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.openPopup('http://staging.example.test/');
    harness.launcher.openPopup('https://staging.example.test:8443/');
    harness.launcher.openPopup('data:text/html,<p>hi</p>');

    const listed = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(listed.tabs.map((tab) => tab.tabId)).toEqual(['tab-1']);
    expect(listed.notices).toHaveLength(3);
  });

  it('names the request safe mode aborted when the page it opened shows the browser error page', async () => {
    const { harness, context, sessionId } = await openHarness();
    const session = await harness.sessions.get(sessionId);
    (session.blockedRequests as { method: string; url: string }[]).push({
      method: 'GET',
      url: 'https://elsewhere.example.test/blocked',
    });
    harness.launcher.openPopup('chrome-error://chromewebdata/');

    const listed = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(listed.notices).toEqual([{ kind: 'tab-blocked', url: 'https://elsewhere.example.test/blocked' }]);
  });

  it('falls back to the error page URL when safe mode aborted nothing', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.openPopup('chrome-error://chromewebdata/');

    const listed = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(listed.notices).toEqual([{ kind: 'tab-blocked', url: 'chrome-error://chromewebdata/' }]);
  });

  it('closes a page that was blank when it opened and then went off the allowlist', async () => {
    const { harness, context, sessionId } = await openHarness();
    const popup = harness.launcher.openPopup('about:blank');
    await runBrowserTabs(context, { sessionId, settleMs: 0 });
    await popup.goto('https://elsewhere.example.test/late');

    const listed = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(listed.tabs.map((tab) => tab.tabId)).toEqual(['tab-1']);
    expect(listed.notices).toEqual([{ kind: 'tab-blocked', url: 'https://elsewhere.example.test/late' }]);
  });

  it('never closes the first page, even when it sits off the allowlist', async () => {
    const { harness, context, sessionId } = await openHarness();
    const [first] = harness.launcher.pages;
    await first?.goto('https://elsewhere.example.test/');

    const listed = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(listed.tabs.map((tab) => tab.tabId)).toEqual(['tab-1']);
    expect(harness.launcher.closedPages).toEqual([]);
  });

  it('forgets a page that closed by itself and falls back to the one before it', async () => {
    const { harness, context, sessionId } = await openHarness();
    const popup = harness.launcher.openPopup(ALLOWED_URL);
    await runBrowserTabs(context, { sessionId, switchTo: 'tab-2', settleMs: 0 });

    await popup.close();
    const listed = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(listed.activeTabId).toBe('tab-1');
    expect(listed.tabs.map((tab) => tab.tabId)).toEqual(['tab-1']);
  });

  it('logs a page it could not close and still drops it from the session', async () => {
    const { harness, context, sessionId, errors } = await openHarness();
    harness.launcher.failClosingWith(new Error('target crashed'));
    harness.launcher.openPopup('https://elsewhere.example.test/');

    const listed = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(listed.tabs.map((tab) => tab.tabId)).toEqual(['tab-1']);
    expect(errors).toMatchObject([{ meta: { code: 'BROWSER_TAB_CLOSE_FAILED', error: 'target crashed' } }]);
  });

  it('logs a page it could not close when the failure is not an Error', async () => {
    const { harness, context, sessionId, errors } = await openHarness();
    harness.launcher.failClosingWith('target crashed');
    harness.launcher.openPopup('https://elsewhere.example.test/');

    await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(errors).toMatchObject([{ meta: { code: 'BROWSER_TAB_CLOSE_FAILED', error: 'target crashed' } }]);
  });

  it('judges a page whose first load fails by where it ended up', async () => {
    const { harness, context, sessionId } = await openHarness();
    harness.launcher.failLoadStateWith(new Error('load failed'));
    harness.launcher.openPopup(ALLOWED_URL);

    const listed = await runBrowserTabs(context, { sessionId, settleMs: 0 });

    expect(listed.tabs.map((tab) => tab.tabId)).toEqual(['tab-1', 'tab-2']);
  });

  it('ignores a page that opens after the session closed', async () => {
    const { harness, sessionId } = await openHarness();
    await harness.sessions.close(sessionId);

    expect(() => harness.launcher.openPopup(ALLOWED_URL)).not.toThrow();
    expect(await harness.sessions.drainNotices(sessionId)).toEqual([]);
  });

  it('waits for the settle time by default before listing', async () => {
    const { context, sessionId } = await openHarness();
    const started = Date.now();

    await runBrowserTabs(context, { sessionId });

    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
  });
});
