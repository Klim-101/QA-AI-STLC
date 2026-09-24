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

export interface HttpRequestDetailsOptions extends HttpRequestOptions {
  /** Defaults to `GET`. */
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface HttpResponseDetails extends HttpResponse {
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyText: string;
}

/**
 * Injected so network calls never happen for real in tests (AGENTS.md 5.3, 13). `get()` is the
 * narrow reachability check `qa doctor` needs; `request()` is the general form interactive case
 * execution needs for the `api` test type (P3-14) — arbitrary method, headers and body, with the
 * full response captured for evidence.
 */
export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  request(url: string, options?: HttpRequestDetailsOptions): Promise<HttpResponseDetails>;
}

// Built once and reused, not per request: a fresh undici Agent per call would open (and never
// pool) a new TLS connection for every reachability check.
const insecureDispatcher = new Agent({ connect: { rejectUnauthorized: false } });

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

async function performRequest(url: string, options: HttpRequestDetailsOptions) {
  const requestInit = {
    method: options.method ?? 'GET',
    ...(options.headers !== undefined ? { headers: options.headers } : {}),
    ...(options.body !== undefined ? { body: options.body } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
  // Node's own global `fetch()` types its `dispatcher` option against a vendored copy of undici's
  // types that does not structurally match the real `undici` package's `Agent` (TS2379), so the
  // insecure path calls undici's own `fetch()` directly instead of the global.
  return options.tlsInsecure === true
    ? await undiciFetch(url, { ...requestInit, dispatcher: insecureDispatcher })
    : await fetch(url, requestInit);
}

export const fetchHttpClient: HttpClient = {
  get: async (url, options) => {
    const response = await performRequest(url, { ...options, method: 'GET' });
    return { ok: response.ok, status: response.status };
  },
  request: async (url, options = {}) => {
    const response = await performRequest(url, options);
    const bodyText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      headers: headersToRecord(response.headers),
      bodyText,
    };
  },
};
