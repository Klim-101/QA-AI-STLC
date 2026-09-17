// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { HttpClient, HttpResponse } from '@qa-ai-stlc/core';

/**
 * An `HttpClient` that never makes a real network call (AGENTS.md 5.3, 13). Not part of the
 * published package: excluded from the build in `tsconfig.build.json`.
 */
export function createFakeHttpClient(response: HttpResponse | Error): HttpClient {
  return {
    get: () => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)),
  };
}
