// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
}

export interface HttpRequestOptions {
  readonly signal?: AbortSignal;
}

/** The one network operation `qa doctor` needs: injected so reachability checks never make a real network call in tests (AGENTS.md 5.3, 13). */
export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

export const fetchHttpClient: HttpClient = {
  get: async (url, options) => {
    const response = await fetch(url, {
      method: 'GET',
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    return { ok: response.ok, status: response.status };
  },
};
