// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { join } from 'node:path';
import { createFakeFileSystem, type FakeFileSystem } from '@qa-ai-stlc/test-utils/fake-file-system';
import { describe, expect, it } from 'vitest';
import { createApiAuthTokenCache } from '../api-auth.js';
import type { EngineContext } from '../engine-context.js';
import type { QaError } from '../errors.js';
import { createFakeEngineContext } from '../test-support/fake-engine-context.js';
import { runHttpExecute } from './http-execute.js';

const NOW = new Date('2026-09-30T10:00:00.000Z');
const URL_ON_ALLOWLIST = 'https://staging.example.test/a';

function configYaml(extra = ''): string {
  return [
    'schemaVersion: 1',
    'testing: { e2e: undecided, api: undecided, a11y: undecided, security: undecided }',
    'environments:',
    '  staging: { baseUrl: "https://staging.example.test/", allowlist: ["staging.example.test"] }',
    'identities: {}',
    'data: { strategy: manual, ownerMarker: qa-ai-stlc }',
    'selectors: { policy: playwright-default, testIdAttribute: data-testid }',
    'agents: { parallelism: 1, spokeTimeoutSeconds: 60, retries: 1 }',
    extra,
    'apiAuth:',
    '  defaults: { staging: token }',
    '  profiles:',
    '    token: { type: bearer, tokenVariable: QA_TOKEN }',
    '    keyQuery: { type: api-key, keyVariable: QA_KEY, in: query, name: api_key }',
    '    keyHeader: { type: api-key, keyVariable: QA_KEY, in: header, name: X-Api-Key }',
    '    account: { type: basic, usernameVariable: QA_USER, passwordVariable: QA_PASSWORD }',
    '    custom: { type: custom-headers, headers: { X-Tenant: QA_TENANT } }',
    '    open: { type: none }',
    '    oauth: { type: oauth2-client-credentials, tokenUrl: "https://staging.example.test/token", clientIdVariable: QA_CLIENT_ID, clientSecretVariable: QA_CLIENT_SECRET }',
    '    elsewhere: { type: oauth2-client-credentials, tokenUrl: "https://idp.other.test/token", clientIdVariable: QA_CLIENT_ID, clientSecretVariable: QA_CLIENT_SECRET }',
    '',
  ].join('\n');
}

const ENV = {
  QA_TOKEN: 'tok-abc-123',
  QA_KEY: 'key-xyz-789',
  QA_USER: 'alice',
  QA_PASSWORD: 'placeholder-password',
  QA_TENANT: 'tenant-1',
  QA_CLIENT_ID: 'client-1',
  QA_CLIENT_SECRET: 'client-secret-1',
};

interface Sent {
  readonly url: string;
  readonly options: Parameters<EngineContext['httpClient']['request']>[1];
}

interface Reply {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly bodyText?: string;
}

function createAuthContext(
  respond: (url: string, options: Sent['options']) => Reply,
  extraConfig = '',
): { readonly context: EngineContext; readonly fs: FakeFileSystem; readonly sent: Sent[] } {
  const sent: Sent[] = [];
  const httpClient: EngineContext['httpClient'] = {
    get: () => Promise.reject(new Error('get() is not used')),
    request: (url, options) => {
      sent.push({ url, options });
      const reply = respond(url, options);
      return Promise.resolve({
        ok: reply.status < 400,
        status: reply.status,
        headers: reply.headers ?? {},
        setCookies: [],
        bodyText: reply.bodyText ?? '',
      });
    },
  };
  const fs = createFakeFileSystem({ [join('project', '.qa', 'config.yaml')]: configYaml(extraConfig) });
  const context = createFakeEngineContext({ fs, httpClient, clock: { now: () => NOW }, env: ENV });
  return { context, fs, sent };
}

function readRecord(fs: FakeFileSystem, evidencePath: string): string {
  return String(fs.getRawFile(join('project', '.qa', evidencePath)));
}

const tokenEndpointReply = (url: string, apiBody: string): Reply =>
  url.endsWith('/token')
    ? { status: 200, bodyText: JSON.stringify({ access_token: 'oauth-tok-9', expires_in: 3600 }) }
    : { status: 200, bodyText: apiBody };

describe('runHttpExecute with an auth profile', () => {
  it('applies the environment default profile when the caller names none', async () => {
    const { context, sent } = createAuthContext(() => ({ status: 200 }));

    await runHttpExecute(context, { runId: 'run-1', url: URL_ON_ALLOWLIST });

    expect(sent[0]?.options?.headers).toEqual({ Authorization: 'Bearer tok-abc-123' });
    expect(sent[0]?.options?.redirect).toBe('manual');
  });

  it('applies a named basic, api-key or custom-headers profile merged with caller headers', async () => {
    const { context, sent } = createAuthContext(() => ({ status: 200 }));
    const url = URL_ON_ALLOWLIST;

    await runHttpExecute(context, {
      runId: 'run-1',
      url,
      auth: 'account',
      headers: { Accept: 'a' },
    });
    await runHttpExecute(context, { runId: 'run-1', url, auth: 'keyHeader' });
    await runHttpExecute(context, { runId: 'run-1', url, auth: 'custom' });

    expect(sent[0]?.options?.headers).toEqual({
      Accept: 'a',
      Authorization: `Basic ${Buffer.from('alice:placeholder-password').toString('base64')}`,
    });
    expect(sent[1]?.options?.headers).toEqual({ 'X-Api-Key': 'key-xyz-789' });
    expect(sent[2]?.options?.headers).toEqual({ 'X-Tenant': 'tenant-1' });
  });

  it('sends an api key in the query string but never records it', async () => {
    const { context, fs, sent } = createAuthContext(() => ({ status: 200 }));

    const result = await runHttpExecute(context, {
      runId: 'run-1',
      url: `${URL_ON_ALLOWLIST}?x=1`,
      auth: 'keyQuery',
    });

    expect(sent[0]?.url).toBe(`${URL_ON_ALLOWLIST}?x=1&api_key=key-xyz-789`);
    const record = readRecord(fs, result.evidence.path);
    expect(record).not.toContain('key-xyz-789');
    expect(JSON.parse(record)).toMatchObject({ url: `${URL_ON_ALLOWLIST}?x=1` });
  });

  it('sends no credential and keeps following redirects for a "none" profile', async () => {
    const { context, sent } = createAuthContext(() => ({ status: 200 }));

    await runHttpExecute(context, { runId: 'run-1', url: URL_ON_ALLOWLIST, auth: 'open' });

    expect(sent[0]?.options?.headers).toEqual({});
    expect(sent[0]?.options).not.toHaveProperty('redirect');
  });

  // The credential must not survive in any stored field, whichever way the response echoes it.
  it('scrubs an echoed credential from headers, body and url before registering evidence', async () => {
    const { context, fs } = createAuthContext(() => ({
      status: 200,
      headers: { 'set-cookie': 'sid=abc', 'x-echo': 'got tok-abc-123', 'x-api-key': 'other' },
      bodyText: JSON.stringify({ you: 'tok-abc-123', enc: encodeURIComponent('tok-abc-123') }),
    }));

    const result = await runHttpExecute(context, {
      runId: 'run-1',
      url: `${URL_ON_ALLOWLIST}?t=tok-abc-123`,
    });

    const record = readRecord(fs, result.evidence.path);
    expect(record).not.toContain('tok-abc-123');
    expect(record).not.toContain('sid=abc');
    expect(JSON.parse(record)).toMatchObject({
      url: `${URL_ON_ALLOWLIST}?t=[REDACTED]`,
      responseHeaders: { 'set-cookie': '[REDACTED]', 'x-echo': 'got [REDACTED]', 'x-api-key': '[REDACTED]' },
    });
  });

  it('scrubs the body before truncating it, so a token cut by the preview limit leaves no fragment', async () => {
    const { context, fs } = createAuthContext(
      () => ({ status: 200, bodyText: `${'y'.repeat(20)}tok-abc-123 tail` }),
      'evidence: { httpBodyPreviewMaxLength: 25 }',
    );

    const result = await runHttpExecute(context, { runId: 'run-1', url: URL_ON_ALLOWLIST });

    const record = JSON.parse(readRecord(fs, result.evidence.path)) as {
      bodyPreview: string;
      truncated: boolean;
    };
    expect(record.bodyPreview).not.toContain('tok');
    expect(record.truncated).toBe(true);
  });

  it('acquires an OAuth token once and reuses it across calls that share a cache', async () => {
    const { context, sent } = createAuthContext((url) => tokenEndpointReply(url, 'ok'));
    const authTokenCache = createApiAuthTokenCache();

    await runHttpExecute(context, { runId: 'run-1', url: URL_ON_ALLOWLIST, auth: 'oauth', authTokenCache });
    await runHttpExecute(context, { runId: 'run-1', url: URL_ON_ALLOWLIST, auth: 'oauth', authTokenCache });

    expect(sent.filter((call) => call.url.endsWith('/token'))).toHaveLength(1);
    expect(sent.at(-1)?.options?.headers).toEqual({ Authorization: 'Bearer oauth-tok-9' });
  });

  it('scrubs a cached token from a later call made under a different profile', async () => {
    const { context, fs } = createAuthContext((url) => tokenEndpointReply(url, 'echo oauth-tok-9'));
    const authTokenCache = createApiAuthTokenCache();
    await runHttpExecute(context, { runId: 'run-1', url: URL_ON_ALLOWLIST, auth: 'oauth', authTokenCache });

    const result = await runHttpExecute(context, {
      runId: 'run-1',
      url: URL_ON_ALLOWLIST,
      auth: 'open',
      authTokenCache,
    });

    expect(readRecord(fs, result.evidence.path)).not.toContain('oauth-tok-9');
  });

  it('refuses an OAuth token URL outside the allowlist without calling anything', async () => {
    const { context, sent } = createAuthContext(() => ({ status: 200 }));

    const error = await runHttpExecute(context, {
      runId: 'run-1',
      url: URL_ON_ALLOWLIST,
      auth: 'elsewhere',
    }).catch((caught: unknown) => caught);

    expect((error as QaError).code).toBe('BROWSER_URL_NOT_ALLOWED');
    expect(sent).toHaveLength(0);
  });

  it('checks the request URL against the allowlist before resolving any credential', async () => {
    const { context, sent } = createAuthContext(() => ({ status: 200 }));

    const error = await runHttpExecute(context, {
      runId: 'run-1',
      url: 'https://evil.test/',
      auth: 'oauth',
    }).catch((caught: unknown) => caught);

    expect((error as QaError).code).toBe('BROWSER_URL_NOT_ALLOWED');
    expect(sent).toHaveLength(0);
  });

  it('fails with a code, and makes no request, when a credential variable is missing', async () => {
    const { context, sent } = createAuthContext(() => ({ status: 200 }));

    const error = await runHttpExecute(
      { ...context, env: {} },
      { runId: 'run-1', url: URL_ON_ALLOWLIST },
    ).catch((caught: unknown) => caught);

    expect((error as QaError).code).toBe('API_AUTH_VARIABLE_MISSING');
    expect(sent).toHaveLength(0);
  });

  it('rejects a profile name that is not configured', async () => {
    const { context } = createAuthContext(() => ({ status: 200 }));

    const error = await runHttpExecute(context, {
      runId: 'run-1',
      url: URL_ON_ALLOWLIST,
      auth: 'nope',
    }).catch((caught: unknown) => caught);

    expect((error as QaError).code).toBe('API_AUTH_PROFILE_UNKNOWN');
  });

  describe('raw credential inputs', () => {
    it.each([
      ['Authorization', { Authorization: 'Bearer x' }],
      ['a lower-case cookie', { cookie: 'sid=1' }],
      ['a configured api-key header', { 'x-api-key': 'k' }],
      ['a configured custom header', { 'X-Tenant': 't' }],
    ])('rejects %s in headers before any request is made', async (_label, headers) => {
      const { context, sent } = createAuthContext(() => ({ status: 200 }));

      const error = await runHttpExecute(context, { runId: 'run-1', url: URL_ON_ALLOWLIST, headers }).catch(
        (caught: unknown) => caught,
      );

      expect((error as QaError).code).toBe('HTTP_CREDENTIAL_INPUT_REJECTED');
      expect((error as QaError).remediation).toContain('"auth"');
      expect(sent).toHaveLength(0);
    });

    it('rejects a configured query parameter in the URL, whatever its case', async () => {
      const { context, sent } = createAuthContext(() => ({ status: 200 }));

      const error = await runHttpExecute(context, {
        runId: 'run-1',
        url: `${URL_ON_ALLOWLIST}?API_KEY=abc`,
      }).catch((caught: unknown) => caught);

      expect((error as QaError).code).toBe('HTTP_CREDENTIAL_INPUT_REJECTED');
      expect((error as QaError).message).not.toContain('abc');
      expect(sent).toHaveLength(0);
    });

    it('rejects a raw credential even when the caller also names a profile', async () => {
      const { context } = createAuthContext(() => ({ status: 200 }));

      const error = await runHttpExecute(context, {
        runId: 'run-1',
        url: URL_ON_ALLOWLIST,
        auth: 'open',
        headers: { Authorization: 'x' },
      }).catch((caught: unknown) => caught);

      expect((error as QaError).code).toBe('HTTP_CREDENTIAL_INPUT_REJECTED');
    });

    it('still allows an ordinary header and query parameter', async () => {
      const { context, sent } = createAuthContext(() => ({ status: 200 }));

      await runHttpExecute(context, {
        runId: 'run-1',
        url: `${URL_ON_ALLOWLIST}?page=2`,
        auth: 'open',
        headers: { Accept: 'application/json' },
      });

      expect(sent).toHaveLength(1);
    });
  });
});

describe('runHttpExecute refreshing a stale OAuth token', () => {
  function createServerSideContext(isAccepted: (authorization: string | undefined) => boolean) {
    let issued = 0;
    return createAuthContext((url, options) => {
      if (url.endsWith('/token')) {
        issued += 1;
        return { status: 200, bodyText: JSON.stringify({ access_token: `oauth-tok-${String(issued)}` }) };
      }
      const authorization = options?.headers?.Authorization;
      return isAccepted(authorization)
        ? { status: 200, bodyText: `hello ${authorization ?? ''}` }
        : { status: 401, bodyText: 'invalid_token' };
    });
  }

  it('drops a cached token that gets a 401, fetches a new one and retries once', async () => {
    let accepted = 'Bearer oauth-tok-1';
    const { context, sent, fs } = createServerSideContext((authorization) => authorization === accepted);
    const authTokenCache = createApiAuthTokenCache();
    const call = () =>
      runHttpExecute(context, { runId: 'run-1', url: URL_ON_ALLOWLIST, auth: 'oauth', authTokenCache });

    const first = await call();
    accepted = 'Bearer oauth-tok-2';
    const second = await call();

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(sent.map((call) => call.url.endsWith('/token'))).toEqual([true, false, false, true, false]);
    expect(authTokenCache.values()).toEqual(['oauth-tok-2']);
    const record = readRecord(fs, second.evidence.path);
    expect(record).not.toContain('oauth-tok-1');
    expect(record).not.toContain('oauth-tok-2');
  });

  it('does not retry a token that was just fetched', async () => {
    const { context, sent } = createServerSideContext(() => false);

    const result = await runHttpExecute(context, { runId: 'run-1', url: URL_ON_ALLOWLIST, auth: 'oauth' });

    expect(result.status).toBe(401);
    expect(sent).toHaveLength(2);
  });

  it('returns the second 401 when the refreshed token is refused as well', async () => {
    const { context, sent } = createServerSideContext(() => false);
    const authTokenCache = createApiAuthTokenCache();
    authTokenCache.set('oauth', 'stale-token', undefined);

    const result = await runHttpExecute(context, {
      runId: 'run-1',
      url: URL_ON_ALLOWLIST,
      auth: 'oauth',
      authTokenCache,
    });

    expect(result.status).toBe(401);
    expect(sent.filter((call) => call.url.endsWith('/token'))).toHaveLength(1);
    expect(sent.filter((call) => !call.url.endsWith('/token'))).toHaveLength(2);
  });

  it('does not retry a 401 for a profile that has no token to refresh', async () => {
    const { context, sent } = createServerSideContext(() => false);

    const result = await runHttpExecute(context, { runId: 'run-1', url: URL_ON_ALLOWLIST, auth: 'account' });

    expect(result.status).toBe(401);
    expect(sent).toHaveLength(1);
  });
});
