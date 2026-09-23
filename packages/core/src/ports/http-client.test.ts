// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHttpClient } from './http-client.js';

const undiciFetch = vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; status: number }>>();

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
});
