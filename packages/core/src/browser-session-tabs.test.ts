// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { BrowserSessionStore, type OpenBrowserSessionOptions } from './browser-session-store.js';
import { createElementRefTable } from './element-refs.js';
import type { AuthPage } from './ports/browser-launcher.js';
import { createSequentialIdGenerator } from './test-support/fake-id-generator.js';

const AT = new Date('2026-09-21T10:00:00.000Z');

async function openSession(extra: Partial<OpenBrowserSessionOptions> = {}) {
  const launcher = createFakeBrowserLauncher();
  const browser = await launcher.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const store = new BrowserSessionStore({ idGenerator: createSequentialIdGenerator('x') });
  const session = store.open({
    browser,
    context,
    page,
    allowlist: ['staging.example.test'],
    baseUrl: 'https://staging.example.test/',
    navigationTimeoutMs: 30_000,
    actionTimeoutMs: 30_000,
    blockedRequests: [],
    ...extra,
  });
  const popup = (): AuthPage => launcher.openPopup('about:blank');
  return { store, session, page, popup };
}

describe('BrowserSessionStore tabs (P6-59)', () => {
  it('starts with the one page as tab-1, dismissing dialogs unless told otherwise', async () => {
    const { session, page } = await openSession();

    expect(session.tabs).toEqual([{ tabId: 'tab-1', page }]);
    expect(session.activeTabId).toBe('tab-1');
    expect(session.dialogPolicy).toBe('dismiss');
  });

  it('keeps the dialog policy it was opened with', async () => {
    const { session } = await openSession({ dialogPolicy: 'accept' });

    expect(session.dialogPolicy).toBe('accept');
  });

  it('adds tabs without switching, never reuses a tab id, and falls back when the active one closes', async () => {
    const { store, session, page, popup } = await openSession();
    const first = popup();
    const second = popup();

    expect(store.addTab(session.sessionId, first)?.tabId).toBe('tab-2');
    expect(store.addTab(session.sessionId, second)?.tabId).toBe('tab-3');
    expect(session.activeTabId).toBe('tab-1');

    store.activateTab(session.sessionId, 'tab-3');
    expect(session.page).toBe(second);

    store.removeTab(session.sessionId, first);
    expect(session.tabs.map((tab) => tab.tabId)).toEqual(['tab-1', 'tab-3']);
    expect(session.page).toBe(second);

    store.removeTab(session.sessionId, second);
    expect(session.page).toBe(page);
    expect(session.activeTabId).toBe('tab-1');
    expect(store.addTab(session.sessionId, first)?.tabId).toBe('tab-4');
  });

  it('retires the refs of a page when another tab becomes active, or the active one closes', async () => {
    const { store, session, page, popup } = await openSession();
    const other = popup();
    store.addTab(session.sessionId, other);
    const table = createElementRefTable('https://staging.example.test/', [
      { ref: 'e1', role: 'button', name: 'Go', isNameTruncated: false },
    ]);

    store.setElementRefs(session.sessionId, table);
    store.activateTab(session.sessionId, 'tab-1');
    expect(session.elementRefs).toBe(table);

    store.activateTab(session.sessionId, 'tab-2');
    expect(session.elementRefs).toBeUndefined();

    store.setElementRefs(session.sessionId, table);
    store.removeTab(session.sessionId, other);
    expect(session.page).toBe(page);
    expect(session.elementRefs).toBeUndefined();
  });

  it('keeps the refs when a tab that is not active closes, and the page when the last tab closes', async () => {
    const { store, session, page, popup } = await openSession();
    const other = popup();
    store.addTab(session.sessionId, other);
    const table = createElementRefTable('https://staging.example.test/', []);
    store.setElementRefs(session.sessionId, table);

    store.removeTab(session.sessionId, other);
    expect(session.elementRefs).toBe(table);

    store.removeTab(session.sessionId, page);
    expect(session.tabs).toEqual([]);
    expect(session.page).toBe(page);
  });

  it('throws BROWSER_TAB_NOT_FOUND for a tab it does not have, and ignores a session it does not hold', async () => {
    const { store, session, page } = await openSession();

    expect(() => store.activateTab(session.sessionId, 'tab-9')).toThrow(
      expect.objectContaining({ code: 'BROWSER_TAB_NOT_FOUND' }) as Error,
    );
    expect(() => store.activateTab('session-missing', 'tab-1')).toThrow(
      expect.objectContaining({ code: 'BROWSER_TAB_NOT_FOUND' }) as Error,
    );
    expect(store.addTab('session-missing', page)).toBeUndefined();
    expect(() => {
      store.removeTab('session-missing', page);
    }).not.toThrow();
  });

  it('hands out each notice and queued record once, oldest first', async () => {
    const { store, session } = await openSession();
    store.addNotice(session.sessionId, { kind: 'tab-blocked', url: 'https://other.test/' });
    store.addNotice(session.sessionId, { kind: 'tab-opened', tabId: 'tab-2', url: 'https://x.test/' });
    store.queueRecord(session.sessionId, { type: 'tab-blocked', tabId: 'tab-2', at: AT });
    store.queueRecord(session.sessionId, { type: 'tab-opened', tabId: 'tab-3', at: AT });

    expect(await store.drainNotices(session.sessionId)).toHaveLength(2);
    expect(await store.drainNotices(session.sessionId)).toEqual([]);
    expect(store.takeQueuedRecords(session.sessionId).map((record) => record.tabId)).toEqual([
      'tab-2',
      'tab-3',
    ]);
    expect(store.takeQueuedRecords(session.sessionId)).toEqual([]);
  });

  it('waits for tracked work, including work that starts more, before handing out notices', async () => {
    const { store, session } = await openSession();
    const order: string[] = [];
    store.trackTabWork(
      session.sessionId,
      (async () => {
        await Promise.resolve();
        store.trackTabWork(
          session.sessionId,
          (async () => {
            await Promise.resolve();
            order.push('inner');
            store.addNotice(session.sessionId, { kind: 'tab-blocked', url: 'https://other.test/' });
          })(),
        );
        order.push('outer');
      })(),
    );

    const notices = await store.drainNotices(session.sessionId);

    expect(order).toEqual(['outer', 'inner']);
    expect(notices).toHaveLength(1);
  });

  it('still hands out notices when tracked work failed', async () => {
    const { store, session } = await openSession();
    store.addNotice(session.sessionId, { kind: 'tab-blocked', url: 'https://other.test/' });
    store.trackTabWork(session.sessionId, Promise.reject(new Error('boom')));

    expect(await store.drainNotices(session.sessionId)).toHaveLength(1);
  });

  it('forgets notices, queued records and pending work when a session closes', async () => {
    const { store, session } = await openSession();
    store.addNotice(session.sessionId, { kind: 'tab-blocked', url: 'https://other.test/' });
    store.queueRecord(session.sessionId, { type: 'tab-blocked', tabId: 'tab-2', at: AT });
    store.trackTabWork(session.sessionId, Promise.resolve());

    await store.close(session.sessionId);

    expect(await store.drainNotices(session.sessionId)).toEqual([]);
    expect(store.takeQueuedRecords(session.sessionId)).toEqual([]);
  });
});
