// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHttpClient } from './http-client.js';

describe('fetchHttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});
