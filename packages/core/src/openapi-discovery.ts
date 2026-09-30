// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { isUrlAllowed } from './browser-allowlist.js';
import { parseOpenApiDocument } from './openapi-endpoints.js';
import type { HttpClient } from './ports/http-client.js';

export const OPENAPI_PROBE_PATHS: readonly string[] = [
  '/openapi.json',
  '/openapi.yaml',
  '/swagger.json',
  '/api-docs',
  '/v3/api-docs',
  '/api/openapi.json',
  '/docs/openapi.json',
];

const PROBE_TIMEOUT_MS = 10_000;
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export interface DiscoveredContract {
  readonly url: string;
  readonly text: string;
  readonly document: Record<string, unknown>;
}

export interface DiscoverOpenApiOptions {
  readonly baseUrl: string;
  readonly allowlist: readonly string[];
  readonly httpClient: HttpClient;
  readonly tlsInsecure?: boolean;
  readonly signal?: AbortSignal;
}

/**
 * Probes the well-known spec paths under `baseUrl` with plain GETs and returns the first that
 * parses as an OpenAPI 3.x document. The allowlist is checked before every request and redirects
 * are not followed, so a probe can never reach a host the operator did not list. A failed probe
 * (network error, 404, an oversized or non-contract body) is expected and skipped.
 */
export async function discoverOpenApiContract(
  options: DiscoverOpenApiOptions,
): Promise<DiscoveredContract | undefined> {
  for (const probePath of OPENAPI_PROBE_PATHS) {
    const url = new URL(probePath, options.baseUrl).toString();
    if (!isUrlAllowed(url, options.allowlist, options.baseUrl)) {
      continue;
    }
    const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);
    try {
      const response = await options.httpClient.request(url, {
        method: 'GET',
        redirect: 'manual',
        signal: options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]),
        ...(options.tlsInsecure === true ? { tlsInsecure: true } : {}),
      });
      if (!response.ok || response.bodyText.length > MAX_DOCUMENT_BYTES) {
        continue;
      }
      const document = parseOpenApiDocument(response.bodyText);
      if (document !== undefined) {
        return { url, text: response.bodyText, document };
      }
    } catch {
      // A refused connection or a timed-out probe just means this path has no contract.
      continue;
    }
  }
  return undefined;
}
