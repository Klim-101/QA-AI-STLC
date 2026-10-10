// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import type { HttpClient } from '@qa-ai-stlc/core';
import type { SecurityAuthorization } from '@qa-ai-stlc/schemas';
import { SecurityProbe } from '../security-probe.js';

export interface ScriptedResponse {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly setCookies?: readonly string[];
  readonly bodyText?: string;
}

export interface ScriptedRequest {
  /** Path and query, as sent. */
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
}

export function authorizationFor(
  baseUrl: string,
  overrides: Partial<SecurityAuthorization> = {},
): SecurityAuthorization {
  const host = new URL(baseUrl).hostname;
  return {
    schemaVersion: 1,
    environment: { name: 'staging', baseUrl, allowlist: [host] },
    checks: ['headers'],
    identities: [],
    prohibitedActions: ['brute force'],
    allowedMutations: [],
    restrictedRoutes: [],
    rateLimit: { requestsPerSecond: 1000, maxRequests: 100 },
    createdAt: '2026-10-10T10:00:00Z',
    ...overrides,
  };
}

/** An `HttpClient` answering from a script and recording what it was asked. */
export function scriptedHttpClient(respond: (request: ScriptedRequest) => ScriptedResponse): {
  readonly client: HttpClient;
  readonly requests: ScriptedRequest[];
} {
  const requests: ScriptedRequest[] = [];
  const client: HttpClient = {
    get: () => Promise.reject(new Error('get() is not used')),
    request: (url, options) => {
      const parsed = new URL(url);
      const request = { path: `${parsed.pathname}${parsed.search}`, headers: options?.headers ?? {} };
      requests.push(request);
      const reply = respond(request);
      return Promise.resolve({
        ok: true,
        status: reply.status ?? 200,
        headers: reply.headers ?? {},
        setCookies: reply.setCookies ?? [],
        bodyText: reply.bodyText ?? '',
      });
    },
  };
  return { client, requests };
}

/**
 * A real `SecurityProbe` in front of a scripted server, so a check is tested against the same
 * limits it meets in an audit and every request it makes can be inspected.
 */
export function scriptedProbe(
  respond: (request: ScriptedRequest) => ScriptedResponse,
  baseUrl = 'http://app.example.test/',
): {
  readonly probe: SecurityProbe;
  readonly authorization: SecurityAuthorization;
  readonly requests: ScriptedRequest[];
} {
  const { client, requests } = scriptedHttpClient(respond);
  const authorization = authorizationFor(baseUrl);
  return {
    probe: new SecurityProbe({ httpClient: client, authorization, pause: () => Promise.resolve() }),
    authorization,
    requests,
  };
}
