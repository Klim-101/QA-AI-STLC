// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { BrowserSessionStore, DEFAULT_SESSION_IDLE_TIMEOUT_MS } from './browser-session-store.js';
import type { AuthBrowser, AuthBrowserContext, AuthPage } from './ports/browser-launcher.js';
import type { Clock } from './ports/clock.js';
import { createFakeBrowserLauncher } from './test-support/fake-browser-launcher.js';
import { createSequentialIdGenerator } from './test-support/fake-id-generator.js';

interface FakeBrowserParts {
  readonly browser: AuthBrowser;
  readonly context: AuthBrowserContext;
  readonly page: AuthPage;
  readonly closed: string[];
}

async function fakeBrowserParts(
  contextClose: () => Promise<void> = () => Promise.resolve(),
): Promise<FakeBrowserParts> {
  const closed: string[] = [];
  const launcher = createFakeBrowserLauncher();
  const realBrowser = await launcher.launch();
  const realContext = await realBrowser.newContext();
  const page = await realContext.newPage();
  const context: AuthBrowserContext = {
    ...realContext,
    close: async () => {
      closed.push('context');
      await contextClose();
    },
  };
  const browser: AuthBrowser = {
    ...realBrowser,
    close: () => {
      closed.push('browser');
      return Promise.resolve();
    },
  };
  return { browser, context, page, closed };
}

function movableClock(start = new Date('2026-09-21T10:00:00.000Z')): Clock & { advance(ms: number): void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

async function storeWithSession(options: { readonly clock?: Clock; readonly idleTimeoutMs?: number } = {}) {
  const parts = await fakeBrowserParts();
  const store = new BrowserSessionStore({
    idGenerator: createSequentialIdGenerator('x'),
    ...options,
  });
  const session = store.open({
    ...parts,
    allowlist: ['staging.example.test'],
    baseUrl: 'https://staging.example.test/',
    blockedRequests: [],
  });
  return { store, session, parts };
}

describe('BrowserSessionStore', () => {
  it('mints a session id and a run id, and copies the allowlist', async () => {
    const { store, session } = await storeWithSession();

    expect(session.sessionId).toBe('session-x-1');
    expect(session.runId).toBe('run-x-2');
    expect(session.allowlist).toEqual(['staging.example.test']);
    expect(store.sessionIds).toEqual(['session-x-1']);
  });

  it('mints evidence ids from the same generator', async () => {
    const { store } = await storeWithSession();

    expect(store.nextEvidenceId()).toBe('evidence-x-3');
  });

  it('returns an open session and marks it used', async () => {
    const clock = movableClock();
    const { store, session } = await storeWithSession({ clock });
    clock.advance(1_000);

    const found = await store.get(session.sessionId);

    expect(found.sessionId).toBe(session.sessionId);
    expect(found.lastActivityAt.toISOString()).toBe('2026-09-21T10:00:01.000Z');
  });

  it('throws BROWSER_SESSION_NOT_FOUND for an unknown id', async () => {
    const store = new BrowserSessionStore();

    await expect(store.get('session-missing')).rejects.toMatchObject({
      code: 'BROWSER_SESSION_NOT_FOUND',
    });
  });

  it('closes and rejects a session that sat idle past the timeout', async () => {
    const clock = movableClock();
    const { store, session, parts } = await storeWithSession({ clock, idleTimeoutMs: 1_000 });
    clock.advance(1_001);

    await expect(store.get(session.sessionId)).rejects.toMatchObject({
      code: 'BROWSER_SESSION_EXPIRED',
    });
    expect(parts.closed).toEqual(['context', 'browser']);
    expect(store.sessionIds).toEqual([]);
  });

  it('keeps a session alive while it is used within the timeout', async () => {
    const clock = movableClock();
    const { store, session } = await storeWithSession({ clock, idleTimeoutMs: 1_000 });

    clock.advance(900);
    await store.get(session.sessionId);
    clock.advance(900);

    await expect(store.get(session.sessionId)).resolves.toMatchObject({ sessionId: session.sessionId });
  });

  it('closes a session and forgets it', async () => {
    const { store, session, parts } = await storeWithSession();

    await store.close(session.sessionId);

    expect(parts.closed).toEqual(['context', 'browser']);
    expect(store.sessionIds).toEqual([]);
  });

  it('ignores a close for an id it does not hold', async () => {
    const store = new BrowserSessionStore();

    await expect(store.close('session-missing')).resolves.toBeUndefined();
  });

  it('still closes the browser when closing its context fails', async () => {
    const parts = await fakeBrowserParts(() => Promise.reject(new Error('context already gone')));
    const store = new BrowserSessionStore({ idGenerator: createSequentialIdGenerator('x') });
    const session = store.open({
      ...parts,
      allowlist: [],
      baseUrl: 'https://staging.example.test/',
      blockedRequests: [],
    });

    await expect(store.close(session.sessionId)).rejects.toThrow('context already gone');

    expect(parts.closed).toEqual(['context', 'browser']);
  });

  it('closes every session at once', async () => {
    const first = await fakeBrowserParts();
    const second = await fakeBrowserParts();
    const store = new BrowserSessionStore();
    store.open({ ...first, allowlist: [], baseUrl: 'https://staging.example.test/', blockedRequests: [] });
    store.open({ ...second, allowlist: [], baseUrl: 'https://staging.example.test/', blockedRequests: [] });

    await store.closeAll();

    expect(store.sessionIds).toEqual([]);
    expect(first.closed).toEqual(['context', 'browser']);
    expect(second.closed).toEqual(['context', 'browser']);
  });

  it('defaults to a five-minute idle timeout and a real clock', async () => {
    const parts = await fakeBrowserParts();
    const store = new BrowserSessionStore();
    const session = store.open({
      ...parts,
      allowlist: [],
      baseUrl: 'https://staging.example.test/',
      blockedRequests: [],
    });

    await expect(store.get(session.sessionId)).resolves.toMatchObject({ sessionId: session.sessionId });
    expect(DEFAULT_SESSION_IDLE_TIMEOUT_MS).toBe(300_000);
  });
});
