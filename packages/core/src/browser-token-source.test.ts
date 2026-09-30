// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { BrowserTokenSource } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import type { BrowserSession } from './browser-session-store.js';
import {
  createSessionOrigin,
  createStorageStateOrigin,
  readBrowserToken,
  type BrowserTokenOrigin,
} from './browser-token-source.js';
import type { QaError } from './errors.js';
import type { StorageState } from './ports/browser-launcher.js';

const SCOPE = { allowlist: ['staging.example.test'], baseUrl: 'https://staging.example.test/' };

const STORAGE_STATE = {
  cookies: [
    { name: 'api_token', value: 'cookie-token', domain: 'other.test' },
    { name: 'api_token', value: 'cookie-token', domain: '.example.test' },
    { name: 'plain', value: 'Bearer prefixed-token', domain: 'staging.example.test' },
    { name: 'empty', value: '', domain: 'staging.example.test' },
  ],
  origins: [
    {
      origin: 'https://evil.test',
      localStorage: [{ name: 'auth', value: '{"token":{"access":"evil-token"}}' }],
    },
    {
      origin: 'https://staging.example.test',
      localStorage: [
        { name: 'auth', value: '{"token":{"access":"local-token","list":["first-token"],"n":42}}' },
        { name: 'raw', value: 'raw-token' },
        { name: 'broken', value: 'not json' },
      ],
    },
  ],
} as unknown as StorageState;

const stateOrigin = createStorageStateOrigin(STORAGE_STATE, SCOPE);

function sessionOrigin(overrides: {
  readonly pageUrl?: string;
  readonly sessionStorageValue?: unknown;
  readonly observed?: ReadonlyMap<string, string>;
}): BrowserTokenOrigin {
  const session = {
    ...SCOPE,
    context: { storageState: () => Promise.resolve(STORAGE_STATE) },
    page: {
      url: () => overrides.pageUrl ?? 'https://staging.example.test/app',
      evaluate: () => Promise.resolve(overrides.sessionStorageValue),
    },
    observedRequestHeaders: overrides.observed ?? new Map<string, string>(),
  } as unknown as BrowserSession;
  return createSessionOrigin(session);
}

async function failureOf(promise: Promise<unknown>): Promise<QaError> {
  return (await promise.then(
    () => new Error('expected a failure'),
    (caught: unknown) => caught,
  )) as QaError;
}

const cookie = (name: string): BrowserTokenSource => ({ kind: 'cookie', name });
const localStorageSource = (key: string, jsonPath?: string): BrowserTokenSource => ({
  kind: 'local-storage',
  key,
  ...(jsonPath !== undefined ? { jsonPath } : {}),
});
const sessionStorageSource = (key: string, jsonPath?: string): BrowserTokenSource => ({
  kind: 'session-storage',
  key,
  ...(jsonPath !== undefined ? { jsonPath } : {}),
});

describe('readBrowserToken from a cookie', () => {
  it('reads an allowlisted cookie, including one set for a parent domain, as a bearer token', async () => {
    expect(await readBrowserToken(cookie('api_token'), stateOrigin)).toEqual({
      headerName: 'Authorization',
      headerValue: 'Bearer cookie-token',
      secretValues: ['cookie-token'],
    });
  });

  it('does not double a Bearer prefix the stored value already has', async () => {
    const token = await readBrowserToken(cookie('plain'), stateOrigin);

    expect(token.headerValue).toBe('Bearer prefixed-token');
    expect(token.secretValues).toEqual(['prefixed-token']);
  });

  it('fails when the cookie is absent or empty, naming the source and never a value', async () => {
    const missing = await failureOf(readBrowserToken(cookie('nope'), stateOrigin));
    const empty = await failureOf(readBrowserToken(cookie('empty'), stateOrigin));

    expect(missing.code).toBe('API_AUTH_SOURCE_UNAVAILABLE');
    expect(missing.message).toContain('"nope"');
    expect(empty.code).toBe('API_AUTH_SOURCE_INVALID');
  });

  it('ignores a cookie whose domain is not on the allowlist', async () => {
    const onlyOffAllowlist = createStorageStateOrigin(
      {
        cookies: [{ name: 'api_token', value: 'x', domain: 'other.test' }],
        origins: [],
      } as unknown as StorageState,
      SCOPE,
    );

    expect((await failureOf(readBrowserToken(cookie('api_token'), onlyOffAllowlist))).code).toBe(
      'API_AUTH_SOURCE_UNAVAILABLE',
    );
  });
});

describe('readBrowserToken from localStorage', () => {
  it('reads a raw value, and a value at a JSON path (object keys, array index, number)', async () => {
    const raw = await readBrowserToken(localStorageSource('raw'), stateOrigin);
    const nested = await readBrowserToken(localStorageSource('auth', 'token.access'), stateOrigin);
    const indexed = await readBrowserToken(localStorageSource('auth', 'token.list.0'), stateOrigin);
    const numeric = await readBrowserToken(localStorageSource('auth', 'token.n'), stateOrigin);

    expect(raw.secretValues).toEqual(['raw-token']);
    expect(nested.secretValues).toEqual(['local-token']);
    expect(indexed.secretValues).toEqual(['first-token']);
    expect(numeric.secretValues).toEqual(['42']);
  });

  it('only reads an origin on the allowlist', async () => {
    const token = await readBrowserToken(localStorageSource('auth', 'token.access'), stateOrigin);

    expect(token.secretValues).not.toContain('evil-token');
  });

  it('fails when the key is absent', async () => {
    expect((await failureOf(readBrowserToken(localStorageSource('nope'), stateOrigin))).code).toBe(
      'API_AUTH_SOURCE_UNAVAILABLE',
    );
  });

  it.each([
    ['a value that is not JSON', localStorageSource('broken', 'a')],
    ['a path that does not exist', localStorageSource('auth', 'token.missing')],
    ['a path through a scalar', localStorageSource('auth', 'token.access.deeper')],
    ['a path that ends on an object', localStorageSource('auth', 'token')],
    ['a path through null', localStorageSource('auth', 'token.nothing.deeper')],
  ])('rejects %s without echoing the value', async (_label, source) => {
    const error = await failureOf(readBrowserToken(source, stateOrigin));

    expect(error.code).toBe('API_AUTH_SOURCE_INVALID');
    expect(error.message).not.toContain('local-token');
  });
});

describe('readBrowserToken from a saved storage state', () => {
  it('cannot read sessionStorage or an observed request header', async () => {
    const storage = await failureOf(readBrowserToken(sessionStorageSource('k'), stateOrigin));
    const header = await failureOf(
      readBrowserToken({ kind: 'request-header', header: 'Authorization' }, stateOrigin),
    );

    expect([storage.code, header.code]).toEqual([
      'API_AUTH_SOURCE_UNSUPPORTED',
      'API_AUTH_SOURCE_UNSUPPORTED',
    ]);
    expect(storage.remediation).toContain('browser session');
  });
});

describe('readBrowserToken from a live session', () => {
  it('reads cookies and localStorage from its storage state like a saved one', async () => {
    const origin = sessionOrigin({});

    expect((await readBrowserToken(cookie('api_token'), origin)).secretValues).toEqual(['cookie-token']);
    expect((await readBrowserToken(localStorageSource('raw'), origin)).secretValues).toEqual(['raw-token']);
  });

  it('reads sessionStorage, with an optional JSON path', async () => {
    const plain = await readBrowserToken(
      sessionStorageSource('k'),
      sessionOrigin({ sessionStorageValue: 'sess-token' }),
    );
    const nested = await readBrowserToken(
      sessionStorageSource('k', 'a.b'),
      sessionOrigin({ sessionStorageValue: '{"a":{"b":"nested-token"}}' }),
    );

    expect(plain.secretValues).toEqual(['sess-token']);
    expect(nested.secretValues).toEqual(['nested-token']);
  });

  it('fails when the sessionStorage key is not set', async () => {
    const error = await failureOf(
      readBrowserToken(sessionStorageSource('k'), sessionOrigin({ sessionStorageValue: null })),
    );

    expect(error.code).toBe('API_AUTH_SOURCE_UNAVAILABLE');
  });

  it('does not read sessionStorage while the page sits off the allowlist', async () => {
    const error = await failureOf(
      readBrowserToken(
        sessionStorageSource('k'),
        sessionOrigin({ pageUrl: 'https://evil.test/', sessionStorageValue: 'evil-token' }),
      ),
    );

    expect(error.code).toBe('API_AUTH_SOURCE_UNAVAILABLE');
    expect(error.message).not.toContain('evil-token');
  });

  it('replays an observed request header as the same header with its full value', async () => {
    const origin = sessionOrigin({
      observed: new Map([
        ['authorization', 'Bearer observed-token'],
        ['x-auth-token', 'custom-token'],
      ]),
    });

    const bearer = await readBrowserToken({ kind: 'request-header', header: 'Authorization' }, origin);
    const custom = await readBrowserToken({ kind: 'request-header', header: 'X-Auth-Token' }, origin);

    expect(bearer).toEqual({
      headerName: 'Authorization',
      headerValue: 'Bearer observed-token',
      secretValues: ['Bearer observed-token', 'observed-token'],
    });
    expect(custom.headerName).toBe('X-Auth-Token');
    expect(custom.headerValue).toBe('custom-token');
  });

  it('fails when no such request header was observed yet, or it was empty', async () => {
    const none = await failureOf(
      readBrowserToken({ kind: 'request-header', header: 'Authorization' }, sessionOrigin({})),
    );
    const empty = await failureOf(
      readBrowserToken(
        { kind: 'request-header', header: 'Authorization' },
        sessionOrigin({ observed: new Map([['authorization', '']]) }),
      ),
    );

    expect([none.code, empty.code]).toEqual(['API_AUTH_SOURCE_UNAVAILABLE', 'API_AUTH_SOURCE_UNAVAILABLE']);
  });
});

describe('an unrecognized token source (schema drift)', () => {
  it('is rejected via assertNever', async () => {
    const drifted = { kind: 'keychain' } as unknown as BrowserTokenSource;

    await expect(readBrowserToken(drifted, stateOrigin)).rejects.toThrow(/Unhandled browser token source/u);
  });
});
