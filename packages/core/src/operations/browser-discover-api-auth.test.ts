// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import type { BrowserSession } from '../browser-session-store.js';
import type { StorageState } from '../ports/browser-launcher.js';
import type { BrowserOperationContext } from './browser-context.js';
import { runBrowserDiscoverApiAuth } from './browser-discover-api-auth.js';

const TOKEN = 'live-token-value-123';
const SCOPE = { allowlist: ['staging.example.test'], baseUrl: 'https://staging.example.test/' };

interface FakeSessionOptions {
  readonly observed?: Readonly<Record<string, string>>;
  readonly storageState?: StorageState;
  readonly sessionStorage?: unknown;
  readonly pageUrl?: string;
}

function contextWith(options: FakeSessionOptions): BrowserOperationContext {
  const session = {
    ...SCOPE,
    context: { storageState: () => Promise.resolve(options.storageState ?? { cookies: [], origins: [] }) },
    page: {
      url: () => options.pageUrl ?? 'https://staging.example.test/app',
      evaluate: () => Promise.resolve(options.sessionStorage ?? []),
    },
    observedRequestHeaders: new Map(Object.entries(options.observed ?? {})),
  } as unknown as BrowserSession;
  return { sessions: { get: () => Promise.resolve(session) } } as unknown as BrowserOperationContext;
}

const cookie = (name: string, value: string, domain = 'staging.example.test') => ({
  name,
  value,
  domain,
  path: '/',
  expires: -1,
  httpOnly: false,
  secure: false,
  sameSite: 'Lax' as const,
});

async function failureOf(promise: Promise<unknown>): Promise<{ code: string; remediation?: string }> {
  return (await promise.then(
    () => new Error('expected a failure'),
    (caught: unknown) => caught,
  )) as { code: string; remediation?: string };
}

const BEARER = { authorization: `Bearer ${TOKEN}` };

describe('runBrowserDiscoverApiAuth', () => {
  it('finds a token kept as the whole value of a localStorage key', async () => {
    const result = await runBrowserDiscoverApiAuth(
      contextWith({
        observed: BEARER,
        storageState: {
          cookies: [],
          origins: [
            { origin: 'https://staging.example.test', localStorage: [{ name: 'jwt', value: TOKEN }] },
          ],
        },
      }),
      { sessionId: 'session-1' },
    );

    expect(result).toEqual({
      sessionId: 'session-1',
      tokenHeader: 'authorization',
      sources: [
        { kind: 'local-storage', key: 'jwt' },
        { kind: 'request-header', header: 'authorization' },
      ],
      proposedProfile: { type: 'from-browser', source: { kind: 'local-storage', key: 'jwt' } },
    });
  });

  it('finds a token nested in a stored JSON value and reports the path to it', async () => {
    const result = await runBrowserDiscoverApiAuth(
      contextWith({
        observed: BEARER,
        storageState: {
          cookies: [],
          origins: [
            {
              origin: 'https://staging.example.test',
              localStorage: [
                { name: 'auth', value: JSON.stringify({ user: { name: 'x' }, tokens: [{ access: TOKEN }] }) },
                { name: 'theme', value: 'dark' },
              ],
            },
          ],
        },
      }),
      { sessionId: 'session-1' },
    );

    expect(result.proposedProfile).toEqual({
      type: 'from-browser',
      source: { kind: 'local-storage', key: 'auth', jsonPath: 'tokens.0.access' },
    });
  });

  it('finds a token in a cookie and in sessionStorage, ahead of the request header', async () => {
    const result = await runBrowserDiscoverApiAuth(
      contextWith({
        observed: BEARER,
        storageState: { cookies: [cookie('access', TOKEN), cookie('other', 'x')], origins: [] },
        sessionStorage: [
          ['oidc', JSON.stringify({ access_token: TOKEN })],
          ['empty', ''],
        ],
      }),
      { sessionId: 'session-1' },
    );

    expect(result.sources).toEqual([
      { kind: 'cookie', name: 'access', sendAs: 'bearer' },
      { kind: 'session-storage', key: 'oidc', jsonPath: 'access_token' },
      { kind: 'request-header', header: 'authorization' },
    ]);
  });

  it('never returns the token value, in the result or in its serialized form', async () => {
    const result = await runBrowserDiscoverApiAuth(
      contextWith({
        observed: BEARER,
        storageState: { cookies: [cookie('access', TOKEN)], origins: [] },
      }),
      { sessionId: 'session-1' },
    );

    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('proposes the request header when the token is stored nowhere it can be read', async () => {
    const result = await runBrowserDiscoverApiAuth(contextWith({ observed: BEARER }), {
      sessionId: 'session-1',
    });

    expect(result.proposedProfile).toEqual({
      type: 'from-browser',
      source: { kind: 'request-header', header: 'authorization' },
    });
  });

  it('ignores storage that is not on the allowlist, and a page that is not either', async () => {
    const result = await runBrowserDiscoverApiAuth(
      contextWith({
        observed: BEARER,
        pageUrl: 'https://evil.test/',
        storageState: {
          cookies: [cookie('access', TOKEN, 'evil.test')],
          origins: [{ origin: 'https://evil.test', localStorage: [{ name: 'jwt', value: TOKEN }] }],
        },
        sessionStorage: [['oidc', TOKEN]],
      }),
      { sessionId: 'session-1' },
    );

    expect(result.sources).toEqual([{ kind: 'request-header', header: 'authorization' }]);
  });

  it('reads a sessionStorage answer of the wrong shape as empty', async () => {
    const result = await runBrowserDiscoverApiAuth(
      contextWith({ observed: BEARER, sessionStorage: { not: 'a list' } }),
      { sessionId: 'session-1' },
    );

    expect(result.sources).toEqual([{ kind: 'request-header', header: 'authorization' }]);
  });

  it('does not look for a value nested deeper than it reads', async () => {
    const deep = { a: { b: { c: { d: { e: { token: TOKEN } } } } } };
    const result = await runBrowserDiscoverApiAuth(
      contextWith({
        observed: BEARER,
        storageState: {
          cookies: [],
          origins: [
            {
              origin: 'https://staging.example.test',
              localStorage: [{ name: 'deep', value: JSON.stringify(deep) }],
            },
          ],
        },
      }),
      { sessionId: 'session-1' },
    );

    expect(result.sources).toEqual([{ kind: 'request-header', header: 'authorization' }]);
  });

  it('does not report a name that is long or holds control characters, which only the page controls', async () => {
    const long = 'k'.repeat(201);
    const result = await runBrowserDiscoverApiAuth(
      contextWith({
        observed: BEARER,
        storageState: {
          cookies: [cookie(`bad${String.fromCharCode(10)}name`, TOKEN), cookie(long, TOKEN)],
          origins: [
            {
              origin: 'https://staging.example.test',
              localStorage: [
                { name: long, value: TOKEN },
                { name: 'auth', value: JSON.stringify({ [long]: TOKEN }) },
              ],
            },
          ],
        },
        sessionStorage: [
          [long, TOKEN],
          ['oidc', JSON.stringify({ [`a${String.fromCharCode(0)}b`]: TOKEN })],
        ],
      }),
      { sessionId: 'session-1' },
    );

    expect(result.sources).toEqual([{ kind: 'request-header', header: 'authorization' }]);
  });

  it('proposes only the request header when the token travels in another header', async () => {
    const result = await runBrowserDiscoverApiAuth(
      contextWith({
        observed: { 'x-session': `Bearer ${TOKEN}` },
        storageState: { cookies: [cookie('access', TOKEN)], origins: [] },
      }),
      { sessionId: 'session-1' },
    );

    expect(result).toMatchObject({
      tokenHeader: 'x-session',
      sources: [{ kind: 'request-header', header: 'x-session' }],
    });
  });

  it('prefers Authorization over another bearer header', async () => {
    const result = await runBrowserDiscoverApiAuth(
      contextWith({ observed: { 'x-session': 'Bearer other', ...BEARER } }),
      { sessionId: 'session-1' },
    );

    expect(result.tokenHeader).toBe('authorization');
  });

  it('asks the operator to sign in when no request carried a token', async () => {
    const error = await failureOf(runBrowserDiscoverApiAuth(contextWith({}), { sessionId: 'session-1' }));

    expect(error.code).toBe('API_AUTH_DISCOVERY_NO_TOKEN');
    expect(error.remediation).toContain('Sign in');
  });

  it('points to a basic profile when the application does not use bearer tokens', async () => {
    const error = await failureOf(
      runBrowserDiscoverApiAuth(contextWith({ observed: { authorization: 'Basic dXNlcjpwYXNz' } }), {
        sessionId: 'session-1',
      }),
    );

    expect(error.code).toBe('API_AUTH_DISCOVERY_NO_TOKEN');
    expect(error.remediation).toContain('basic');
  });
});
