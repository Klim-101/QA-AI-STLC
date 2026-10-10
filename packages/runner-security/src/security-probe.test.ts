// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { HttpClient, HttpRequestDetailsOptions, HttpResponseDetails } from '@qa-ai-stlc/core';
import type { SecurityAuthorization } from '@qa-ai-stlc/schemas';
import { describe, expect, it } from 'vitest';
import { SecurityProbe } from './security-probe.js';

const AUTHORIZATION: SecurityAuthorization = {
  schemaVersion: 1,
  environment: {
    name: 'staging',
    baseUrl: 'https://staging.example.test/',
    allowlist: ['staging.example.test'],
  },
  checks: ['headers'],
  identities: [],
  prohibitedActions: ['brute force'],
  allowedMutations: [
    { method: 'POST', path: '/tasks/ping', reason: 'A no-op endpoint owned by the test team' },
  ],
  restrictedRoutes: [],
  rateLimit: { requestsPerSecond: 2, maxRequests: 3 },
  createdAt: '2026-10-10T10:00:00Z',
};

interface SentRequest {
  readonly url: string;
  readonly options: HttpRequestDetailsOptions | undefined;
}

function scriptedClient(
  respond: (request: SentRequest) => Partial<HttpResponseDetails> | Error = () => ({}),
): { readonly client: HttpClient; readonly sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  const client: HttpClient = {
    get: () => Promise.reject(new Error('get() is not used')),
    request: (url, options) => {
      const request = { url, options };
      sent.push(request);
      const reply = respond(request);
      if (reply instanceof Error) {
        return Promise.reject(reply);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: {},
        setCookies: [],
        bodyText: '',
        ...reply,
      });
    },
  };
  return { client, sent };
}

function probeWith(
  client: HttpClient,
  options: {
    readonly authorization?: SecurityAuthorization;
    readonly pause?: (milliseconds: number) => Promise<void>;
    readonly nowMs?: () => number;
    readonly tlsInsecure?: boolean;
    readonly requestTimeoutMs?: number;
  } = {},
): SecurityProbe {
  return new SecurityProbe({
    httpClient: client,
    authorization: options.authorization ?? AUTHORIZATION,
    pause: options.pause ?? (() => Promise.resolve()),
    nowMs: options.nowMs ?? (() => 0),
    ...(options.tlsInsecure !== undefined ? { tlsInsecure: options.tlsInsecure } : {}),
    ...(options.requestTimeoutMs !== undefined ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
  });
}

describe('SecurityProbe requests', () => {
  it('sends a read to the authorized origin and logs it without query values', async () => {
    const { client, sent } = scriptedClient(() => ({
      status: 200,
      headers: { server: 'demo' },
      setCookies: ['sid=abc; HttpOnly'],
      bodyText: 'hello',
    }));
    const probe = probeWith(client);

    const response = await probe.request({ method: 'get', path: '/tasks?token=secret-value&page=2' });

    expect(response).toEqual({
      status: 200,
      headers: { server: 'demo' },
      setCookies: ['sid=abc; HttpOnly'],
      bodyText: 'hello',
      requestIndex: 0,
    });
    expect(sent[0]?.url).toBe('https://staging.example.test/tasks?token=secret-value&page=2');
    expect(sent[0]?.options).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(sent[0]?.options?.signal).toBeInstanceOf(AbortSignal);
    expect(probe.log).toEqual([
      { method: 'GET', url: 'https://staging.example.test/tasks?token&page', outcome: 'sent', status: 200 },
    ]);
  });

  it('passes request headers and a body through, and never follows a redirect', async () => {
    const { client, sent } = scriptedClient();
    const probe = probeWith(client);

    await probe.request({
      method: 'POST',
      path: '/tasks/ping',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect(sent[0]?.options).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      redirect: 'manual',
    });
  });

  it('caps the response body it hands to a check', async () => {
    const { client } = scriptedClient(() => ({ bodyText: 'x'.repeat(100_000) }));

    const response = await probeWith(client).request({ method: 'GET', path: '/' });

    expect(response.bodyText).toHaveLength(64 * 1024);
  });

  it('turns certificate validation off only when the environment says so', async () => {
    const { client, sent } = scriptedClient();

    await probeWith(client, { tlsInsecure: true }).request({ method: 'GET', path: '/' });
    await probeWith(client).request({ method: 'GET', path: '/' });

    expect(sent[0]?.options?.tlsInsecure).toBe(true);
    expect(sent[1]?.options?.tlsInsecure).toBeUndefined();
  });

  it('gives every request a timeout', async () => {
    const { client, sent } = scriptedClient();

    await probeWith(client, { requestTimeoutMs: 5 }).request({ method: 'GET', path: '/' });

    expect(sent[0]?.options?.signal?.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent[0]?.options?.signal?.aborted).toBe(true);
  });

  it('reports a request that failed, keeps the cause and logs it as sent without a status', async () => {
    const cause = new Error('connection reset');
    const { client } = scriptedClient(() => cause);
    const probe = probeWith(client);

    const failure = await probe.request({ method: 'GET', path: '/' }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'SECURITY_REQUEST_FAILED', cause });
    expect(probe.log).toEqual([
      {
        method: 'GET',
        url: 'https://staging.example.test/',
        outcome: 'sent',
        reason: 'the request failed before a response arrived',
      },
    ]);
  });
});

describe('SecurityProbe scope', () => {
  it.each([
    ['a full URL on another host', 'https://evil.example.test/steal'],
    ['a protocol-relative URL', '//evil.example.test/steal'],
    ['a backslash that browsers read as a slash', '/\\evil.example.test/steal'],
    ['a relative path', 'tasks'],
    ['a different scheme on the same host', 'http://staging.example.test/'],
  ])('never sends %s', async (_label, path) => {
    const { client, sent } = scriptedClient();
    const probe = probeWith(client);

    await expect(probe.request({ method: 'GET', path })).rejects.toMatchObject({
      code: 'SECURITY_REQUEST_REFUSED',
    });

    expect(sent).toEqual([]);
    expect(probe.log).toHaveLength(1);
    expect(probe.log[0]).toMatchObject({ outcome: 'refused' });
  });

  it('refuses an authorized path when the environment base URL is on another origin than the allowlist implies', async () => {
    const authorization: SecurityAuthorization = {
      ...AUTHORIZATION,
      environment: {
        name: 'staging',
        baseUrl: 'https://other.example.test/',
        allowlist: ['staging.example.test'],
      },
    };
    const { client, sent } = scriptedClient();

    await expect(
      probeWith(client, { authorization }).request({ method: 'GET', path: '/' }),
    ).rejects.toMatchObject({ code: 'SECURITY_REQUEST_REFUSED' });

    expect(sent).toEqual([]);
  });

  it('logs a refusal with the host-relative request it saw and the reason', async () => {
    const probe = probeWith(scriptedClient().client);

    await probe.request({ method: 'GET', path: '//evil.example.test/steal' }).catch(() => undefined);

    expect(probe.log).toEqual([
      {
        method: 'GET',
        url: '//evil.example.test/steal',
        outcome: 'refused',
        reason: 'not an absolute path on the audited host',
      },
    ]);
  });
});

describe('SecurityProbe mutations', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'refuses %s to a path the authorization does not name',
    async (method) => {
      const { client, sent } = scriptedClient();
      const probe = probeWith(client);

      await expect(probe.request({ method, path: '/tasks/1' })).rejects.toMatchObject({
        code: 'SECURITY_REQUEST_REFUSED',
      });

      expect(sent).toEqual([]);
      expect(probe.log[0]).toMatchObject({
        outcome: 'refused',
        reason: 'not a read and not an authorized mutation',
      });
    },
  );

  it('allows exactly the authorized method on exactly the authorized path', async () => {
    const { client, sent } = scriptedClient();
    const probe = probeWith(client);

    await probe.request({ method: 'POST', path: '/tasks/ping' });

    expect(sent).toHaveLength(1);
  });

  it('does not let an authorized path be used with another method', async () => {
    const { client, sent } = scriptedClient();

    await expect(probeWith(client).request({ method: 'DELETE', path: '/tasks/ping' })).rejects.toMatchObject({
      code: 'SECURITY_REQUEST_REFUSED',
    });

    expect(sent).toEqual([]);
  });

  it('does not let a path that merely starts like the authorized one through', async () => {
    const { client, sent } = scriptedClient();

    await expect(
      probeWith(client).request({ method: 'POST', path: '/tasks/ping/extra' }),
    ).rejects.toMatchObject({
      code: 'SECURITY_REQUEST_REFUSED',
    });

    expect(sent).toEqual([]);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('allows %s without any authorization entry', async (method) => {
    const { client, sent } = scriptedClient();

    await probeWith(client).request({ method, path: '/anything' });

    expect(sent).toHaveLength(1);
  });
});

describe('SecurityProbe limits', () => {
  it('waits out the rest of the interval between two requests', async () => {
    const waits: number[] = [];
    let now = 1000;
    const probe = probeWith(scriptedClient().client, {
      nowMs: () => now,
      pause: (milliseconds) => {
        waits.push(milliseconds);
        now += milliseconds;
        return Promise.resolve();
      },
    });

    await probe.request({ method: 'GET', path: '/a' });
    now += 100;
    await probe.request({ method: 'GET', path: '/b' });

    // Two requests per second is 500 ms apart; 100 ms had passed.
    expect(waits).toEqual([400]);
  });

  it('does not wait when the interval has already passed', async () => {
    const waits: number[] = [];
    let now = 0;
    const probe = probeWith(scriptedClient().client, {
      nowMs: () => now,
      pause: (milliseconds) => {
        waits.push(milliseconds);
        return Promise.resolve();
      },
    });

    await probe.request({ method: 'GET', path: '/a' });
    now += 5000;
    await probe.request({ method: 'GET', path: '/b' });

    expect(waits).toEqual([]);
  });

  it('waits for real when no pause is injected', async () => {
    const probe = new SecurityProbe({
      httpClient: scriptedClient().client,
      authorization: { ...AUTHORIZATION, rateLimit: { requestsPerSecond: 50, maxRequests: 5 } },
    });

    const startedAt = Date.now();
    await probe.request({ method: 'GET', path: '/a' });
    await probe.request({ method: 'GET', path: '/b' });

    // 50 requests per second is 20 ms apart.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);
  });

  it('stops at the authorized request budget and says so', async () => {
    const { client, sent } = scriptedClient();
    const probe = probeWith(client);

    await probe.request({ method: 'GET', path: '/1' });
    await probe.request({ method: 'GET', path: '/2' });
    expect(probe.isBudgetExhausted).toBe(false);
    await probe.request({ method: 'GET', path: '/3' });

    expect(probe.isBudgetExhausted).toBe(true);
    await expect(probe.request({ method: 'GET', path: '/4' })).rejects.toMatchObject({
      code: 'SECURITY_BUDGET_EXHAUSTED',
    });
    expect(sent).toHaveLength(3);
  });

  it('counts a request that failed against the budget', async () => {
    const { client } = scriptedClient(() => new Error('down'));
    const probe = probeWith(client);

    for (const path of ['/1', '/2', '/3']) {
      await probe.request({ method: 'GET', path }).catch(() => undefined);
    }

    expect(probe.isBudgetExhausted).toBe(true);
  });

  it('does not count a refused request against the budget', async () => {
    const probe = probeWith(scriptedClient().client);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await probe.request({ method: 'DELETE', path: '/x' }).catch(() => undefined);
    }

    expect(probe.isBudgetExhausted).toBe(false);
  });
});
