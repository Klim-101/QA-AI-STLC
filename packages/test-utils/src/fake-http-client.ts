// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

// This package stays a leaf with no dependency on any other workspace package (AGENTS.md 5.7), so
// the shape below is a plain structural duplicate of `@qa-ai-stlc/core`'s `HttpClient`/`HttpResponse`
// ports rather than an import of them -- TypeScript's structural typing means a `createFakeHttpClient`
// result still satisfies `HttpClient` at every call site that expects one.
export interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
}

export interface HttpClientLike {
  get(url: string, options?: { readonly signal?: AbortSignal }): Promise<HttpResponseLike>;
}

/**
 * An `HttpClient` for unit tests across the monorepo (AGENTS.md 5.3, 13) that never makes a real
 * network call: it always resolves to (or rejects with) whatever was configured up front.
 */
export function createFakeHttpClient(response: HttpResponseLike | Error): HttpClientLike {
  return {
    get: () => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)),
  };
}
