// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { createFakeHttpClient } from './fake-http-client.js';

describe('createFakeHttpClient', () => {
  it('resolves with the given response', async () => {
    const client = createFakeHttpClient({ ok: true, status: 200 });

    await expect(client.get('https://example.com')).resolves.toStrictEqual({ ok: true, status: 200 });
  });

  it('rejects with the given error', async () => {
    const client = createFakeHttpClient(new Error('network down'));

    await expect(client.get('https://example.com')).rejects.toThrow('network down');
  });

  it('request() resolves with headers/bodyText defaults when the response omits them', async () => {
    const client = createFakeHttpClient({ ok: true, status: 200 });

    await expect(client.request('https://example.com')).resolves.toStrictEqual({
      ok: true,
      status: 200,
      headers: {},
      bodyText: '',
    });
  });

  it('request() resolves with the given headers and bodyText', async () => {
    const client = createFakeHttpClient({
      ok: false,
      status: 401,
      headers: { 'content-type': 'text/html' },
      bodyText: 'Invalid email or password.',
    });

    await expect(client.request('https://example.com/login', { method: 'POST' })).resolves.toStrictEqual({
      ok: false,
      status: 401,
      headers: { 'content-type': 'text/html' },
      bodyText: 'Invalid email or password.',
    });
  });

  it('request() rejects with the given error', async () => {
    const client = createFakeHttpClient(new Error('network down'));

    await expect(client.request('https://example.com')).rejects.toThrow('network down');
  });
});
