// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { Agent, fetch as undiciFetch } from 'undici';

export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
}

export interface HttpRequestOptions {
  readonly signal?: AbortSignal;
  /** Bypasses TLS certificate validation for this request (P2-18); off by default. */
  readonly tlsInsecure?: boolean;
}

/** The one network operation `qa doctor` needs: injected so reachability checks never make a real network call in tests (AGENTS.md 5.3, 13). */
export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

// Built once and reused, not per request: a fresh undici Agent per call would open (and never
// pool) a new TLS connection for every reachability check.
const insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

export const fetchHttpClient: HttpClient = {
  get: async (url, options) => {
    // Node's own global `fetch()` types its `dispatcher` option against a vendored copy of
    // undici's types that does not structurally match the real `undici` package's `Agent`
    // (TS2379), so the insecure path calls undici's own `fetch()` directly instead of the global.
    const response =
      options?.tlsInsecure === true
        ? await undiciFetch(url, {
            method: 'GET',
            dispatcher: insecureDispatcher,
            ...(options.signal ? { signal: options.signal } : {}),
          })
        : await fetch(url, {
            method: 'GET',
            ...(options?.signal ? { signal: options.signal } : {}),
          });
    return { ok: response.ok, status: response.status };
  },
};
