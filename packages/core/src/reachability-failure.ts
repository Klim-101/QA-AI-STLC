// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

export interface ReachabilityFailure {
  readonly reason: string;
  readonly remediation: string;
}

export interface ReachabilityFailureContext {
  /** True when the check's own time limit aborted the request. */
  readonly timedOut: boolean;
  readonly timeoutMs: number;
}

const CERTIFICATE_ERROR_CODES: ReadonlySet<string> = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);
const NAME_RESOLUTION_ERROR_CODES: ReadonlySet<string> = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const CONNECTION_TIMEOUT_ERROR_CODES: ReadonlySet<string> = new Set([
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
]);
const CONNECTION_RESET_ERROR_CODES: ReadonlySet<string> = new Set(['ECONNRESET', 'UND_ERR_SOCKET']);
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/u;

function readCode(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('code' in value)) {
    return undefined;
  }
  return typeof value.code === 'string' ? value.code : undefined;
}

// `fetch` wraps the system error (`ECONNREFUSED`, a certificate code, ...) in a `TypeError` whose
// `cause` carries the code, so the cause is read first.
function readErrorCode(error: unknown): string | undefined {
  const cause = error instanceof Error ? error.cause : undefined;
  return readCode(cause) ?? readCode(error);
}

/**
 * Turns whatever a failed reachability request threw into a short reason and a remediation that fit
 * it. The error's own message is never used: it can carry the request URL, including a credential
 * in its query string. Only a well-formed error code is repeated.
 */
export function describeReachabilityFailure(
  error: unknown,
  context: ReachabilityFailureContext,
): ReachabilityFailure {
  if (context.timedOut) {
    return {
      reason: `no response within ${String(context.timeoutMs)} ms`,
      remediation:
        'Check the application is running and answering. An endpoint that builds its response on each request can be slow on a cold start: retry once it has answered.',
    };
  }
  const code = readErrorCode(error);
  if (code === 'ECONNREFUSED') {
    return {
      reason: 'connection refused',
      remediation:
        'Nothing is listening on that host and port. Start the application, or correct the host and port in config.yaml.',
    };
  }
  if (code !== undefined && NAME_RESOLUTION_ERROR_CODES.has(code)) {
    return {
      reason: 'the host name could not be resolved',
      remediation: 'Check the host name in config.yaml and the network or VPN connection.',
    };
  }
  if (code !== undefined && CERTIFICATE_ERROR_CODES.has(code)) {
    return {
      reason: 'the TLS certificate is not trusted',
      remediation:
        'Fix the certificate. For a test environment with a self-signed certificate, set tlsInsecure on the environment (it is reported as a relaxation).',
    };
  }
  if (code !== undefined && CONNECTION_TIMEOUT_ERROR_CODES.has(code)) {
    return {
      reason: 'the connection attempt timed out',
      remediation:
        'Check the host is reachable from this machine (firewall, VPN, proxy) and the application is running.',
    };
  }
  if (code !== undefined && CONNECTION_RESET_ERROR_CODES.has(code)) {
    return {
      reason: 'the connection was reset',
      remediation: 'The server closed the connection. Check the application logs, then retry.',
    };
  }
  if (code === 'ERR_INVALID_URL') {
    return {
      reason: 'the URL is not valid',
      remediation: 'Use an absolute URL with its scheme, for example "https://example.test".',
    };
  }
  return {
    reason:
      code !== undefined && ERROR_CODE_PATTERN.test(code)
        ? `the request failed (${code})`
        : 'the request failed',
    remediation: 'Check the environment is running and the configured URL is correct.',
  };
}

/**
 * The URL as it may appear in a message: without credentials in the authority, without a fragment
 * and with every query value hidden, keeping the query keys (a document selector such as
 * `?api-docs.json` is a key). A string that is not a URL is not echoed at all.
 */
export function redactUrlForDisplay(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '[invalid URL]';
  }
  const query = parsed.search
    .slice(1)
    .split('&')
    .filter((pair) => pair !== '')
    .map((pair) => {
      const separatorIndex = pair.indexOf('=');
      return separatorIndex === -1 ? pair : `${pair.slice(0, separatorIndex)}=[REDACTED]`;
    })
    .join('&');
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${query === '' ? '' : `?${query}`}`;
}
