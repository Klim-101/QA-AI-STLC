// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHttpClient } from './http-client.js';

const undiciFetch = vi.fn<
  (...args: unknown[]) => Promise<{
    ok: boolean;
    status: number;
    headers?: Headers;
    text?: () => Promise<string>;
  }>
>();

vi.mock('undici', () => ({
  // A named function, not an empty class, stands in for undici's `Agent`: it is only ever used
  // as `new Agent(...)` here, never inspected, so no constructor body is needed.
  Agent: function Agent(): void {
    /* stub */
  },
  fetch: (...args: unknown[]) => undiciFetch(...args),
}));

describe('fetchHttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    undiciFetch.mockReset();
  });

  it('reports ok and status from a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const response = await fetchHttpClient.get('https://example.com');

    expect(response).toEqual({ ok: true, status: 200 });
    expect(fetch).toHaveBeenCalledWith('https://example.com', { method: 'GET' });
  });

  it('passes the abort signal through', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await fetchHttpClient.get('https://example.com', { signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledWith('https://example.com', {
      method: 'GET',
      signal: controller.signal,
    });
  });

  it("uses undici's own fetch with an insecure dispatcher when tlsInsecure is true (P2-18)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    undiciFetch.mockResolvedValue({ ok: true, status: 200 });

    const response = await fetchHttpClient.get('https://staging.internal', { tlsInsecure: true });

    expect(response).toEqual({ ok: true, status: 200 });
    expect(fetchMock).not.toHaveBeenCalled();
    const [url, options] = undiciFetch.mock.calls[0] ?? [];
    expect(url).toBe('https://staging.internal');
    expect(options).toMatchObject({ method: 'GET' });
    expect((options as { dispatcher?: unknown } | undefined)?.dispatcher).toBeDefined();
  });

  it('passes the abort signal through on the insecure path too', async () => {
    vi.stubGlobal('fetch', vi.fn());
    undiciFetch.mockResolvedValue({ ok: true, status: 200 });
    const controller = new AbortController();

    await fetchHttpClient.get('https://staging.internal', { tlsInsecure: true, signal: controller.signal });

    const [, options] = undiciFetch.mock.calls[0] ?? [];
    expect(options).toMatchObject({ method: 'GET', signal: controller.signal });
  });

  it('request() defaults to GET with no body when no options are given', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, headers: new Headers(), text: () => Promise.resolve('') });
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchHttpClient.request('https://example.com');

    expect(response).toEqual({ ok: true, status: 200, headers: {}, bodyText: '' });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com', { method: 'GET' });
  });

  it('request() passes method, headers and body through', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: () => Promise.resolve('<p>Invalid email or password.</p>'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchHttpClient.request('https://example.com/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=a%40b.com&password=wrong',
    });

    expect(response).toEqual({
      ok: false,
      status: 401,
      headers: { 'content-type': 'text/html' },
      bodyText: '<p>Invalid email or password.</p>',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=a%40b.com&password=wrong',
    });
  });

  it('request() uses the insecure dispatcher when tlsInsecure is true', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    undiciFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve(''),
    });

    await fetchHttpClient.request('https://staging.internal', { method: 'POST', tlsInsecure: true });

    expect(fetchMock).not.toHaveBeenCalled();
    const [, options] = undiciFetch.mock.calls[0] ?? [];
    expect(options).toMatchObject({ method: 'POST' });
    expect((options as { dispatcher?: unknown } | undefined)?.dispatcher).toBeDefined();
  });
});
