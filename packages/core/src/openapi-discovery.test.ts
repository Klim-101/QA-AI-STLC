// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequestDetailsOptions } from './ports/http-client.js';
import { discoverOpenApiContract, OPENAPI_PROBE_PATHS } from './openapi-discovery.js';

const SPEC = '{"openapi":"3.0.3","paths":{}}';
const BASE_URL = 'https://staging.example.com/app/';

interface Recorded {
  readonly url: string;
  readonly options: HttpRequestDetailsOptions | undefined;
}

function clientAnswering(
  answer: (url: string) => { ok: boolean; status: number; bodyText: string } | Error,
  recorded: Recorded[] = [],
): HttpClient {
  return {
    get: () => Promise.reject(new Error('get is not used')),
    request: (url, options) => {
      recorded.push({ url, options });
      const result = answer(url);
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve({ ...result, headers: {}, setCookies: [] });
    },
  };
}

describe('discoverOpenApiContract', () => {
  it('returns the first probe path that serves an OpenAPI document, GET-only and without redirects', async () => {
    const recorded: Recorded[] = [];
    const httpClient = clientAnswering(
      (url) =>
        url.endsWith('/openapi.yaml')
          ? { ok: true, status: 200, bodyText: SPEC }
          : { ok: false, status: 404, bodyText: '' },
      recorded,
    );

    const found = await discoverOpenApiContract({
      baseUrl: BASE_URL,
      allowlist: ['staging.example.com'],
      httpClient,
    });

    expect(found?.url).toBe('https://staging.example.com/openapi.yaml');
    expect(found?.text).toBe(SPEC);
    expect(recorded.map((entry) => entry.url)).toEqual([
      'https://staging.example.com/openapi.json',
      'https://staging.example.com/openapi.yaml',
    ]);
    expect(recorded[0]?.options).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(recorded[0]?.options?.signal).toBeInstanceOf(AbortSignal);
    expect(recorded[0]?.options?.tlsInsecure).toBeUndefined();
  });

  it('skips failed, oversized, non-contract and throwing probes, then gives up', async () => {
    const answers: ({ ok: boolean; status: number; bodyText: string } | Error)[] = [
      new Error('connection refused'),
      { ok: true, status: 200, bodyText: '<html></html>' },
      { ok: true, status: 200, bodyText: 'x'.repeat(5 * 1024 * 1024 + 1) },
    ];
    let call = 0;
    const httpClient = clientAnswering(() => answers[call++] ?? { ok: false, status: 500, bodyText: '' });

    const found = await discoverOpenApiContract({
      baseUrl: BASE_URL,
      allowlist: ['staging.example.com'],
      httpClient,
    });

    expect(found).toBeUndefined();
    expect(call).toBe(OPENAPI_PROBE_PATHS.length);
  });

  it('sends no request when the base URL host is not on the allowlist', async () => {
    const recorded: Recorded[] = [];
    const httpClient = clientAnswering(() => ({ ok: true, status: 200, bodyText: SPEC }), recorded);

    const found = await discoverOpenApiContract({
      baseUrl: BASE_URL,
      allowlist: ['other.example.com'],
      httpClient,
    });

    expect(found).toBeUndefined();
    expect(recorded).toEqual([]);
  });

  it('forwards tlsInsecure and honours a caller abort signal', async () => {
    const recorded: Recorded[] = [];
    const httpClient = clientAnswering(() => ({ ok: true, status: 200, bodyText: SPEC }), recorded);
    const controller = new AbortController();

    await discoverOpenApiContract({
      baseUrl: BASE_URL,
      allowlist: ['staging.example.com'],
      httpClient,
      tlsInsecure: true,
      signal: controller.signal,
    });

    expect(recorded[0]?.options?.tlsInsecure).toBe(true);
    controller.abort();
    expect(recorded[0]?.options?.signal?.aborted).toBe(true);
  });
});
