// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { observeRequestHeaders } from './browser-request-observer.js';
import type { RouteRequest } from './ports/browser-launcher.js';

const SCOPE = { allowlist: ['staging.example.test'], baseUrl: 'https://staging.example.test/' };
const NAMES: ReadonlySet<string> = new Set(['authorization', 'x-auth-token']);

function request(url: string, headers: Record<string, string> | undefined): RouteRequest {
  return {
    method: () => 'GET',
    url: () => url,
    ...(headers !== undefined ? { allHeaders: () => Promise.resolve(headers) } : {}),
  };
}

describe('observeRequestHeaders', () => {
  it('records only the named headers of a request to an allowlisted host, lower-cased and latest-wins', async () => {
    const observed = new Map<string, string>();

    await observeRequestHeaders(
      request('https://staging.example.test/api', { Authorization: 'Bearer one', Accept: 'json' }),
      NAMES,
      SCOPE,
      observed,
    );
    await observeRequestHeaders(
      request('https://staging.example.test/api', { authorization: 'Bearer two', 'X-Auth-Token': 't' }),
      NAMES,
      SCOPE,
      observed,
    );

    expect([...observed]).toEqual([
      ['authorization', 'Bearer two'],
      ['x-auth-token', 't'],
    ]);
  });

  it('never records a request to a host off the allowlist', async () => {
    const observed = new Map<string, string>();

    await observeRequestHeaders(
      request('https://evil.test/api', { Authorization: 'x' }),
      NAMES,
      SCOPE,
      observed,
    );

    expect(observed.size).toBe(0);
  });

  it('does nothing when the request cannot report its headers', async () => {
    const observed = new Map<string, string>();

    await observeRequestHeaders(request('https://staging.example.test/', undefined), NAMES, SCOPE, observed);

    expect(observed.size).toBe(0);
  });

  it('keeps Authorization and any bearer-valued header even when no profile names them (P6-93)', async () => {
    const observed = new Map<string, string>();

    await observeRequestHeaders(
      request('https://staging.example.test/api', {
        Authorization: 'Basic dXNlcjpwYXNz',
        'X-Session': 'Bearer abc123',
        Accept: 'application/json',
        'X-Trace': 'Bearer',
      }),
      new Set(),
      SCOPE,
      observed,
    );

    expect([...observed]).toEqual([
      ['authorization', 'Basic dXNlcjpwYXNz'],
      ['x-session', 'Bearer abc123'],
    ]);
  });
});
