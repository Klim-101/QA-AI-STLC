// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import type { Config, EnvironmentConfig } from '@qa-ai-stlc/schemas';
import { createFakeBrowserLauncher } from '@qa-ai-stlc/test-utils/fake-browser-launcher';
import { createFakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { BrowserSessionStore } from '../browser-session-store.js';
import type { QaError } from '../errors.js';
import { QaStore } from '../qa-store.js';
import { resolveBrowserTokenOrigin } from './http-execute-browser-origin.js';

const ENVIRONMENT = {
  baseUrl: 'https://staging.example.test/',
  allowlist: ['staging.example.test'],
} as unknown as EnvironmentConfig;
const CONFIG = { identities: { tester: {} } } as unknown as Config;

function createStore(files: Record<string, string> = {}): QaStore {
  const fs = createFakeFileSystem(
    Object.fromEntries(Object.entries(files).map(([path, text]) => [join('project', '.qa', path), text])),
  );
  return new QaStore({ projectRoot: 'project', fs });
}

async function openSession(sessions: BrowserSessionStore, baseUrl: string): Promise<string> {
  const browser = await createFakeBrowserLauncher().launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  return sessions.open({
    browser,
    context,
    page,
    allowlist: ENVIRONMENT.allowlist,
    baseUrl,
    navigationTimeoutMs: 1000,
    actionTimeoutMs: 1000,
    blockedRequests: [],
  }).sessionId;
}

async function failureOf(promise: Promise<unknown>): Promise<QaError> {
  return (await promise.then(
    () => new Error('expected a failure'),
    (caught: unknown) => caught,
  )) as QaError;
}

describe('resolveBrowserTokenOrigin', () => {
  it('returns nothing when neither a session nor an identity was given', async () => {
    expect(await resolveBrowserTokenOrigin({}, ENVIRONMENT, CONFIG, createStore())).toBeUndefined();
  });

  it('refuses both a session and an identity', async () => {
    const error = await failureOf(
      resolveBrowserTokenOrigin(
        { browserSessionId: 's', identity: 'tester' },
        ENVIRONMENT,
        CONFIG,
        createStore(),
      ),
    );

    expect(error.code).toBe('API_AUTH_SESSION_AMBIGUOUS');
  });

  it('reads from an open session of the same environment', async () => {
    const sessions = new BrowserSessionStore();
    const sessionId = await openSession(sessions, ENVIRONMENT.baseUrl);

    const origin = await resolveBrowserTokenOrigin(
      { browserSessionId: sessionId, sessions },
      ENVIRONMENT,
      CONFIG,
      createStore(),
    );

    expect(origin?.description).toBe('the open browser session');
  });

  it('refuses an unknown session, and any session when there is no session store', async () => {
    const sessions = new BrowserSessionStore();

    const unknown = await failureOf(
      resolveBrowserTokenOrigin({ browserSessionId: 'nope', sessions }, ENVIRONMENT, CONFIG, createStore()),
    );
    const noStore = await failureOf(
      resolveBrowserTokenOrigin({ browserSessionId: 'nope' }, ENVIRONMENT, CONFIG, createStore()),
    );

    expect([unknown.code, noStore.code]).toEqual(['BROWSER_SESSION_NOT_FOUND', 'BROWSER_SESSION_NOT_FOUND']);
  });

  // A token read from one application must never be sent to another.
  it('refuses a session that belongs to a different environment', async () => {
    const sessions = new BrowserSessionStore();
    const sessionId = await openSession(sessions, 'https://production.example.test/');

    const error = await failureOf(
      resolveBrowserTokenOrigin(
        { browserSessionId: sessionId, sessions },
        ENVIRONMENT,
        CONFIG,
        createStore(),
      ),
    );

    expect(error.code).toBe('API_AUTH_SESSION_MISMATCH');
  });

  it('reads from the saved storage state of a configured identity', async () => {
    const store = createStore({ 'auth/tester.json': JSON.stringify({ cookies: [], origins: [] }) });

    const origin = await resolveBrowserTokenOrigin({ identity: 'tester' }, ENVIRONMENT, CONFIG, store);

    expect(origin?.description).toBe('the saved storage state');
  });

  it('refuses an identity that is not configured, including a prototype key or a path', async () => {
    for (const identity of ['nobody', 'constructor', '../config']) {
      const error = await failureOf(
        resolveBrowserTokenOrigin({ identity }, ENVIRONMENT, CONFIG, createStore()),
      );

      expect(error.code).toBe('API_AUTH_IDENTITY_UNKNOWN');
    }
  });

  it('says so when a configured identity has no saved storage state or none is configured at all', async () => {
    const notAuthenticated = await failureOf(
      resolveBrowserTokenOrigin({ identity: 'tester' }, ENVIRONMENT, CONFIG, createStore()),
    );
    const noIdentities = await failureOf(
      resolveBrowserTokenOrigin(
        { identity: 'x' },
        ENVIRONMENT,
        { identities: {} } as unknown as Config,
        createStore(),
      ),
    );

    expect(notAuthenticated.code).toBe('API_AUTH_IDENTITY_NOT_AUTHENTICATED');
    expect(noIdentities.remediation).toContain('(none configured)');
  });
});
