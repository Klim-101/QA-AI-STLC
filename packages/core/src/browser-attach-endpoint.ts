// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { QaError } from './errors.js';

const CDP_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:', 'ws:', 'wss:']);
const IPV4_LOOPBACK = /^127(?:\.\d{1,3}){3}$/u;

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || IPV4_LOOPBACK.test(hostname);
}

/**
 * Accepts only a DevTools endpoint on this machine. A debugging port is full control of a browser
 * and everything it is signed into, so reaching one over the network is never what the operator
 * meant, and an agent-supplied host must not turn this tool into a way to drive someone else's.
 * Returns the endpoint unchanged; throws `BROWSER_ATTACH_ENDPOINT_INVALID` or
 * `BROWSER_ATTACH_ENDPOINT_NOT_LOOPBACK`.
 */
export function assertLoopbackCdpEndpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch (error) {
    throw new QaError('BROWSER_ATTACH_ENDPOINT_INVALID', 'The attach endpoint is not a URL', {
      remediation: 'Pass the DevTools endpoint, for example http://127.0.0.1:9222.',
      cause: error,
    });
  }
  if (!CDP_PROTOCOLS.has(url.protocol) || url.username !== '' || url.password !== '') {
    throw new QaError(
      'BROWSER_ATTACH_ENDPOINT_INVALID',
      'The attach endpoint must be an http, https, ws or wss URL without credentials',
      { remediation: 'Pass the DevTools endpoint, for example http://127.0.0.1:9222.' },
    );
  }
  if (!isLoopbackHostname(url.hostname)) {
    throw new QaError(
      'BROWSER_ATTACH_ENDPOINT_NOT_LOOPBACK',
      'The attach endpoint is not on this machine: only localhost, 127.0.0.0/8 and ::1 are accepted',
      {
        remediation:
          'Start the browser on this machine with --remote-debugging-port and attach to its loopback address.',
      },
    );
  }
  return endpoint;
}
