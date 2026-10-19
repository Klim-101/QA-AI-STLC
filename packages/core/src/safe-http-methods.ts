// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * The HTTP methods the engine treats as reads (ADR-0018): safe mode lets a request with one of them
 * through, and the security probe sends them without an authorization entry. One definition, so no
 * path can call a method a read while another calls it a mutation. `TRACE` is left out on purpose.
 */
export const SAFE_HTTP_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS', 'QUERY']);

/** Exact and case-sensitive: a server treats `query` and `QUERY` as different methods. */
export function isSafeHttpMethod(method: string): boolean {
  return SAFE_HTTP_METHODS.has(method);
}
