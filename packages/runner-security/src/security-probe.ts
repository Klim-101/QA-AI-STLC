// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError, isUrlAllowed, type HttpClient } from '@qa-ai-stlc/core';
import type { SecurityAuthorization, SecurityRequestLogEntry } from '@qa-ai-stlc/schemas';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_BODY_CHARACTERS = 64 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export interface ProbeRequest {
  readonly method: string;
  /** An absolute path on the audited host, such as `/admin/users`; never a full URL. */
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface ProbeResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly setCookies: readonly string[];
  /** Capped; page-controlled, so untrusted. */
  readonly bodyText: string;
  /** Position of this request in the probe's log, for a finding to cite. */
  readonly requestIndex: number;
}

export interface SecurityProbeOptions {
  readonly httpClient: HttpClient;
  readonly authorization: SecurityAuthorization;
  /** Whether the environment's configuration turns off certificate validation (ADR-011). */
  readonly tlsInsecure?: boolean;
  readonly requestTimeoutMs?: number;
  /** Waits between requests to honour the rate limit; injected so tests run without real delay. */
  readonly pause?: (milliseconds: number) => Promise<void>;
  readonly nowMs?: () => number;
}

function realPause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Where a request went, without query values (they can carry tokens) or credentials in the URL. */
function describeUrl(url: URL): string {
  const names = [...url.searchParams.keys()];
  return `${url.origin}${url.pathname}${names.length > 0 ? `?${names.join('&')}` : ''}`;
}

/**
 * The one way an audit reaches the network. Every limit the operator authorized is enforced here
 * and nowhere else, so no check can bypass it (AGENTS.md 12.7): a request is sent only to the
 * authorized origin and allowlist, a method that is not a read only when the authorization names
 * that exact method and path, never faster than the rate limit, and never beyond the request
 * budget. Redirects are not followed: each hop would have to pass the same checks. Every request,
 * sent or refused, is logged for the audit result.
 */
export class SecurityProbe {
  readonly log: SecurityRequestLogEntry[] = [];
  private sentCount = 0;
  private lastSentAtMs: number | undefined;
  private readonly httpClient: HttpClient;
  private readonly authorization: SecurityAuthorization;
  private readonly tlsInsecure: boolean;
  private readonly requestTimeoutMs: number;
  private readonly pause: (milliseconds: number) => Promise<void>;
  private readonly nowMs: () => number;

  constructor(options: SecurityProbeOptions) {
    this.httpClient = options.httpClient;
    this.authorization = options.authorization;
    this.tlsInsecure = options.tlsInsecure === true;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.pause = options.pause ?? realPause;
    this.nowMs = options.nowMs ?? Date.now;
  }

  async request(request: ProbeRequest): Promise<ProbeResponse> {
    const method = request.method.toUpperCase();
    const url = this.resolve(method, request.path);
    this.refuseUnlessPermitted(method, request.path, url);

    if (this.sentCount >= this.authorization.rateLimit.maxRequests) {
      throw new QaError(
        'SECURITY_BUDGET_EXHAUSTED',
        `The audit sent its authorized ${String(this.authorization.rateLimit.maxRequests)} requests and stopped`,
        { remediation: 'Authorize a larger request budget if the operator wants a longer audit.' },
      );
    }
    await this.waitForRateLimit();

    const requestIndex = this.log.length;
    this.sentCount += 1;
    try {
      const response = await this.httpClient.request(url.href, {
        method,
        ...(request.headers !== undefined ? { headers: request.headers } : {}),
        ...(request.body !== undefined ? { body: request.body } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(this.requestTimeoutMs),
        ...(this.tlsInsecure ? { tlsInsecure: true } : {}),
      });
      this.log.push({ method, url: describeUrl(url), outcome: 'sent', status: response.status });
      return {
        status: response.status,
        headers: response.headers,
        setCookies: response.setCookies,
        bodyText: response.bodyText.slice(0, MAX_BODY_CHARACTERS),
        requestIndex,
      };
    } catch (error) {
      this.log.push({
        method,
        url: describeUrl(url),
        outcome: 'sent',
        reason: 'the request failed before a response arrived',
      });
      throw new QaError('SECURITY_REQUEST_FAILED', `${method} ${describeUrl(url)} failed`, {
        cause: error,
        remediation: 'Check that the environment is reachable, then run the audit again.',
      });
    }
  }

  /** Whether the audit has used up its authorized request budget. */
  get isBudgetExhausted(): boolean {
    return this.sentCount >= this.authorization.rateLimit.maxRequests;
  }

  private resolve(method: string, path: string): URL {
    // A path that is really a URL would let the host part escape the authorized origin.
    if (!path.startsWith('/') || path.startsWith('//')) {
      this.refuse(method, path, 'not an absolute path on the audited host');
    }
    return new URL(path, this.authorization.environment.baseUrl);
  }

  private refuseUnlessPermitted(method: string, path: string, url: URL): void {
    const { baseUrl, allowlist } = this.authorization.environment;
    if (!isUrlAllowed(url.href, allowlist, baseUrl)) {
      this.refuse(method, path, 'outside the authorized origin and allowlist', url);
    }
    if (SAFE_METHODS.has(method)) {
      return;
    }
    const isAuthorizedMutation = this.authorization.allowedMutations.some(
      (mutation) => mutation.method === method && mutation.path === url.pathname,
    );
    if (!isAuthorizedMutation) {
      this.refuse(method, path, 'not a read and not an authorized mutation', url);
    }
  }

  private refuse(method: string, path: string, reason: string, url?: URL): never {
    this.log.push({
      method,
      url: url === undefined ? path : describeUrl(url),
      outcome: 'refused',
      reason,
    });
    throw new QaError('SECURITY_REQUEST_REFUSED', `${method} ${path} was refused: ${reason}`, {
      remediation:
        'An audit only sends reads and the mutations its authorization names, to the authorized origin.',
    });
  }

  private async waitForRateLimit(): Promise<void> {
    const intervalMs = 1000 / this.authorization.rateLimit.requestsPerSecond;
    if (this.lastSentAtMs !== undefined) {
      const waitMs = this.lastSentAtMs + intervalMs - this.nowMs();
      if (waitMs > 0) {
        await this.pause(waitMs);
      }
    }
    this.lastSentAtMs = this.nowMs();
  }
}
