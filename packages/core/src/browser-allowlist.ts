// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError } from './errors.js';

/** Reports whether `url`'s hostname is on the configured domain allowlist (AGENTS.md 12.4). */
export function isUrlAllowed(url: string, allowlist: readonly string[]): boolean {
  const hostname = tryHostname(url);
  return hostname !== undefined && allowlist.includes(hostname);
}

/**
 * The enforcement point for an agent-driven browser session (ADR-005): a navigation target off
 * the environment's allowlist never reaches the network, and the agent gets a coded failure it
 * can act on rather than a silent redirect to somewhere it was not authorized to go.
 */
export function assertUrlAllowed(url: string, allowlist: readonly string[]): void {
  const hostname = tryHostname(url);
  if (hostname === undefined) {
    throw new QaError('BROWSER_URL_INVALID', `"${url}" is not an absolute URL`, {
      remediation: 'Pass an absolute URL including its scheme, for example "https://example.test/login".',
    });
  }
  if (!allowlist.includes(hostname)) {
    throw new QaError('BROWSER_URL_NOT_ALLOWED', `"${hostname}" is not on this session's domain allowlist`, {
      remediation: `Navigate only to: ${allowlist.join(', ')}. Add the host to the environment's allowlist in .qa/config.yaml if it belongs in scope.`,
    });
  }
}

function tryHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
