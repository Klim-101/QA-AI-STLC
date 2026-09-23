// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError } from './errors.js';

/**
 * Reports whether `url` is on the configured domain allowlist (AGENTS.md 12.4): its hostname must
 * be listed, and its scheme and effective port (explicit, or the scheme's default) must match
 * `baseUrl`'s. One environment is one scheme-and-port policy across every allowed host, not just
 * `baseUrl`'s own -- without this, `http://staging.example.test:9999/` would pass a hostname-only
 * check against an environment whose real, HTTPS-on-443 application never listens there (#306).
 */
export function isUrlAllowed(url: string, allowlist: readonly string[], baseUrl: string): boolean {
  const parsed = tryParseUrl(url);
  const expected = tryParseUrl(baseUrl);
  if (parsed === undefined || expected === undefined) {
    return false;
  }
  return (
    allowlist.includes(parsed.hostname) &&
    parsed.protocol === expected.protocol &&
    effectivePort(parsed) === effectivePort(expected)
  );
}

/**
 * The enforcement point for an agent-driven browser session (ADR-005): a navigation target off
 * the environment's allowlist, scheme or port never reaches the network, and the agent gets a
 * coded failure it can act on rather than a silent redirect to somewhere it was not authorized to
 * go.
 */
export function assertUrlAllowed(url: string, allowlist: readonly string[], baseUrl: string): void {
  const parsed = tryParseUrl(url);
  if (parsed === undefined) {
    throw new QaError('BROWSER_URL_INVALID', `"${url}" is not an absolute URL`, {
      remediation: 'Pass an absolute URL including its scheme, for example "https://example.test/login".',
    });
  }
  const expected = tryParseUrl(baseUrl);
  if (expected === undefined) {
    throw new QaError('BROWSER_BASE_URL_INVALID', `"${baseUrl}" is not an absolute URL`, {
      remediation: "Set the environment's baseUrl in .qa/config.yaml to an absolute URL.",
    });
  }
  if (!allowlist.includes(parsed.hostname)) {
    throw new QaError(
      'BROWSER_URL_NOT_ALLOWED',
      `"${parsed.hostname}" is not on this session's domain allowlist`,
      {
        remediation: `Navigate only to: ${allowlist.join(', ')}. Add the host to the environment's allowlist in .qa/config.yaml if it belongs in scope.`,
      },
    );
  }
  if (parsed.protocol !== expected.protocol || effectivePort(parsed) !== effectivePort(expected)) {
    throw new QaError(
      'BROWSER_URL_NOT_ALLOWED',
      `"${url}" does not match this session's scheme and port (${expected.protocol}//${parsed.hostname}${effectivePortSuffix(expected)})`,
      {
        remediation: "Navigate using the same scheme and port as the environment's configured baseUrl.",
      },
    );
  }
}

function tryParseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

function effectivePort(url: URL): string {
  if (url.port !== '') {
    return url.port;
  }
  return url.protocol === 'https:' ? '443' : '80';
}

function effectivePortSuffix(url: URL): string {
  const port = effectivePort(url);
  const isDefault =
    (url.protocol === 'https:' && port === '443') || (url.protocol === 'http:' && port === '80');
  return isDefault ? '' : `:${port}`;
}
