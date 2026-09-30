// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { ApiAuthConfig } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import {
  collectSensitiveNames,
  createApiAuthTokenCache,
  resolveApiAuth,
  selectApiAuthProfileName,
  type ResolveApiAuthOptions,
} from './api-auth.js';
import type { EngineContext } from './engine-context.js';
import { QaError } from './errors.js';
import { createFakeEngineContext } from './test-support/fake-engine-context.js';

const NOW = new Date('2026-09-30T10:00:00.000Z');
const ENVIRONMENT = { allowlist: ['staging.example.test'], baseUrl: 'https://staging.example.test/' };

const API_AUTH: ApiAuthConfig = {
  profiles: {
    open: { type: 'none' },
    account: { type: 'basic', usernameVariable: 'QA_USER', passwordVariable: 'QA_PASSWORD' },
    token: { type: 'bearer', tokenVariable: 'QA_TOKEN' },
    keyHeader: { type: 'api-key', keyVariable: 'QA_KEY', in: 'header', name: 'X-Api-Key' },
    keyQuery: { type: 'api-key', keyVariable: 'QA_KEY', in: 'query', name: 'api_key' },
    custom: { type: 'custom-headers', headers: { 'X-Tenant': 'QA_TENANT', 'X-Signature': 'QA_SIGNATURE' } },
    oauth: {
      type: 'oauth2-client-credentials',
      tokenUrl: 'https://staging.example.test/oauth/token',
      clientIdVariable: 'QA_CLIENT_ID',
      clientSecretVariable: 'QA_CLIENT_SECRET',
      scope: 'read',
    },
    elsewhere: {
      type: 'oauth2-client-credentials',
      tokenUrl: 'https://idp.other.test/oauth/token',
      clientIdVariable: 'QA_CLIENT_ID',
      clientSecretVariable: 'QA_CLIENT_SECRET',
    },
    session: { type: 'from-browser', source: { kind: 'request-header', header: 'Authorization' } },
  },
  defaults: { staging: 'token' },
};

const ENV = {
  QA_USER: 'alice',
  QA_PASSWORD: 'p@ss:word',
  QA_TOKEN: 'tok-abc-123',
  QA_KEY: 'key-xyz-789',
  QA_TENANT: 'tenant-1',
  QA_SIGNATURE: 'sig-1',
  QA_CLIENT_ID: 'client-1',
  QA_CLIENT_SECRET: 'client-secret-1',
};

interface TokenCall {
  readonly url: string;
  readonly options: Parameters<EngineContext['httpClient']['request']>[1];
}

function createContext(
  tokenResponse: { ok: boolean; status: number; bodyText: string } = {
    ok: true,
    status: 200,
    bodyText: JSON.stringify({ access_token: 'oauth-token-1', expires_in: 3600 }),
  },
  env: Record<string, string | undefined> = ENV,
): { readonly context: EngineContext; readonly calls: TokenCall[] } {
  const calls: TokenCall[] = [];
  const context = createFakeEngineContext({
    env,
    clock: { now: () => NOW },
    httpClient: {
      get: () => Promise.reject(new Error('get() is not used')),
      request: (url, options) => {
        calls.push({ url, options });
        return Promise.resolve({ headers: {}, ...tokenResponse });
      },
    },
  });
  return { context, calls };
}

function resolve(
  context: EngineContext,
  profileName: string,
  overrides: Partial<ResolveApiAuthOptions> = {},
): ReturnType<typeof resolveApiAuth> {
  return resolveApiAuth(context, {
    profileName,
    apiAuth: API_AUTH,
    environment: ENVIRONMENT,
    tokenCache: createApiAuthTokenCache(),
    ...overrides,
  });
}

describe('resolveApiAuth', () => {
  it('sends nothing for a "none" profile', async () => {
    const result = await resolve(createContext().context, 'open');

    expect(result).toEqual({
      profileName: 'open',
      profileType: 'none',
      headers: {},
      queryParameters: {},
      secretValues: [],
    });
  });

  it('builds a Basic header and reports the password and the encoded pair as secrets', async () => {
    const result = await resolve(createContext().context, 'account');

    const encoded = Buffer.from('alice:p@ss:word').toString('base64');
    expect(result.headers).toEqual({ Authorization: `Basic ${encoded}` });
    expect(result.secretValues).toEqual(['p@ss:word', encoded]);
  });

  it('builds a Bearer header', async () => {
    const result = await resolve(createContext().context, 'token');

    expect(result.headers).toEqual({ Authorization: 'Bearer tok-abc-123' });
    expect(result.secretValues).toEqual(['tok-abc-123']);
  });

  it('sends an api key as a header or as a query parameter under the configured name', async () => {
    const { context } = createContext();

    const inHeader = await resolve(context, 'keyHeader');
    const inQuery = await resolve(context, 'keyQuery');

    expect(inHeader).toMatchObject({ headers: { 'X-Api-Key': 'key-xyz-789' }, queryParameters: {} });
    expect(inQuery).toMatchObject({ headers: {}, queryParameters: { api_key: 'key-xyz-789' } });
  });

  it('reads each custom header from its own variable', async () => {
    const result = await resolve(createContext().context, 'custom');

    expect(result.headers).toEqual({ 'X-Tenant': 'tenant-1', 'X-Signature': 'sig-1' });
    expect(result.secretValues).toEqual(['tenant-1', 'sig-1']);
  });

  it('fails with a code naming the variable, never a value, when one is unset or empty', async () => {
    for (const env of [
      { ...ENV, QA_TOKEN: undefined },
      { ...ENV, QA_TOKEN: '' },
    ]) {
      const error = await resolve(createContext(undefined, env).context, 'token').catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(QaError);
      expect((error as QaError).code).toBe('API_AUTH_VARIABLE_MISSING');
      expect((error as QaError).message).toContain('QA_TOKEN');
    }
  });

  it('refuses a profile that is not configured', async () => {
    const error = await resolve(createContext().context, 'missing').catch((caught: unknown) => caught);

    expect((error as QaError).code).toBe('API_AUTH_PROFILE_UNKNOWN');
  });

  it('cannot read a token from a browser session yet and says so', async () => {
    const error = await resolve(createContext().context, 'session').catch((caught: unknown) => caught);

    expect((error as QaError).code).toBe('API_AUTH_PROFILE_UNSUPPORTED');
  });
});

describe('resolveApiAuth with oauth2-client-credentials', () => {
  it('requests a token with the configured form fields and caches it for the next call', async () => {
    const { context, calls } = createContext();
    const tokenCache = createApiAuthTokenCache();

    const first = await resolve(context, 'oauth', { tokenCache });
    const second = await resolve(context, 'oauth', { tokenCache });

    expect(first.headers).toEqual({ Authorization: 'Bearer oauth-token-1' });
    expect(second.headers).toEqual(first.headers);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://staging.example.test/oauth/token');
    expect(calls[0]?.options).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(new URLSearchParams(calls[0]?.options?.body).toString()).toBe(
      'grant_type=client_credentials&client_id=client-1&client_secret=client-secret-1&scope=read',
    );
    expect(tokenCache.values()).toEqual(['oauth-token-1']);
  });

  it('requests a fresh token once the cached one has expired', async () => {
    const { context, calls } = createContext();
    const tokenCache = createApiAuthTokenCache();
    tokenCache.set('oauth', 'stale', NOW.getTime() - 1);

    const result = await resolve(context, 'oauth', { tokenCache });

    expect(result.headers).toEqual({ Authorization: 'Bearer oauth-token-1' });
    expect(calls).toHaveLength(1);
    expect(tokenCache.values()).toEqual(['oauth-token-1']);
  });

  it('keeps a token whose response carries no expiry, and passes tlsInsecure and a signal through', async () => {
    const { context, calls } = createContext({
      ok: true,
      status: 200,
      bodyText: JSON.stringify({ access_token: 'no-expiry' }),
    });
    const tokenCache = createApiAuthTokenCache();
    const signal = new AbortController().signal;

    await resolve(context, 'oauth', {
      tokenCache,
      signal,
      environment: { ...ENVIRONMENT, tlsInsecure: true },
    });

    expect(calls[0]?.options).toMatchObject({ tlsInsecure: true, signal });
    expect(tokenCache.get('oauth', NOW.getTime() + 10 ** 12)).toBe('no-expiry');
  });

  it('omits the scope field when the profile has none', async () => {
    const { context, calls } = createContext();
    const profile = { ...API_AUTH.profiles.oauth, tokenUrl: 'https://staging.example.test/t' };
    delete (profile as { scope?: string }).scope;

    await resolve(context, 'oauth', {
      apiAuth: { ...API_AUTH, profiles: { oauth: profile } as ApiAuthConfig['profiles'] },
    });

    expect(new URLSearchParams(calls[0]?.options?.body).has('scope')).toBe(false);
  });

  // The token request carries a client secret, so it must face the allowlist like any other call.
  it('refuses a token URL outside the allowlist before any variable is read or request made', async () => {
    const { context, calls } = createContext(undefined, {});

    const error = await resolve(context, 'elsewhere').catch((caught: unknown) => caught);

    expect((error as QaError).code).toBe('BROWSER_URL_NOT_ALLOWED');
    expect(calls).toHaveLength(0);
  });

  it('fails without echoing the response when the token endpoint refuses', async () => {
    const { context } = createContext({ ok: false, status: 401, bodyText: 'client-secret-1 rejected' });

    const error = await resolve(context, 'oauth').catch((caught: unknown) => caught);

    expect((error as QaError).code).toBe('API_AUTH_TOKEN_REQUEST_FAILED');
    expect((error as QaError).message).not.toContain('client-secret-1');
  });

  it.each([
    ['not JSON', 'nope'],
    ['JSON null', 'null'],
    ['no access_token', '{}'],
    ['an empty access_token', '{"access_token":""}'],
  ])('rejects a token response that is %s', async (_label, bodyText) => {
    const { context } = createContext({ ok: true, status: 200, bodyText });

    const error = await resolve(context, 'oauth').catch((caught: unknown) => caught);

    expect((error as QaError).code).toBe('API_AUTH_TOKEN_RESPONSE_INVALID');
  });
});

function catchError(action: () => unknown): QaError {
  try {
    action();
  } catch (caught) {
    return caught as QaError;
  }
  throw new Error('expected the action to throw');
}

describe('selectApiAuthProfileName', () => {
  it('prefers the requested profile, then the environment default, then none', () => {
    expect(selectApiAuthProfileName(API_AUTH, 'staging', 'account')).toBe('account');
    expect(selectApiAuthProfileName(API_AUTH, 'staging', undefined)).toBe('token');
    expect(selectApiAuthProfileName(API_AUTH, 'prod', undefined)).toBeUndefined();
  });

  it('rejects an unknown name and lists the configured ones', () => {
    const named = catchError(() => selectApiAuthProfileName(API_AUTH, 'staging', 'nope'));
    const none = catchError(() =>
      selectApiAuthProfileName({ profiles: {}, defaults: {} }, 'staging', 'nope'),
    );

    expect(named.code).toBe('API_AUTH_PROFILE_UNKNOWN');
    expect(named.remediation).toContain('account');
    expect(none.remediation).toContain('(none configured)');
  });
});

describe('collectSensitiveNames', () => {
  it('gathers every header and query-parameter name any profile declares', () => {
    const names = collectSensitiveNames(API_AUTH);

    expect(names.headers).toEqual(
      expect.arrayContaining(['X-Api-Key', 'X-Tenant', 'X-Signature', 'Authorization']),
    );
    expect(names.queryParameters).toEqual(['api_key']);
  });

  it('is empty when no profile carries a credential', () => {
    expect(collectSensitiveNames({ profiles: { open: { type: 'none' } }, defaults: {} })).toEqual({
      headers: [],
      queryParameters: [],
    });
  });
});

describe('an unrecognized profile type (schema drift)', () => {
  const drifted = {
    profiles: { odd: { type: 'kerberos' } },
    defaults: {},
  } as unknown as ApiAuthConfig;

  it('is rejected by the resolver and by name collection via assertNever', async () => {
    await expect(resolve(createContext().context, 'odd', { apiAuth: drifted })).rejects.toThrow(
      /Unhandled apiAuth profile/u,
    );
    expect(() => collectSensitiveNames(drifted)).toThrow(/Unhandled apiAuth profile/u);
  });
});

describe('createApiAuthTokenCache', () => {
  it('returns nothing for a profile that was never stored', () => {
    expect(createApiAuthTokenCache().get('x', NOW.getTime())).toBeUndefined();
  });
});
