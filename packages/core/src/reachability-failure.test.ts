// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { describeReachabilityFailure, redactUrlForDisplay } from './reachability-failure.js';

const NOT_TIMED_OUT = { timedOut: false, timeoutMs: 5000 };

// What `fetch` throws for a failed connection: a `TypeError` whose `cause` carries the system code.
function fetchFailure(code: string): Error {
  return new TypeError('fetch failed', { cause: Object.assign(new Error('system error'), { code }) });
}

describe('describeReachabilityFailure', () => {
  it('names the limit when the check aborted the request itself', () => {
    const failure = describeReachabilityFailure(new Error('aborted'), { timedOut: true, timeoutMs: 5000 });

    expect(failure.reason).toBe('no response within 5000 ms');
    expect(failure.remediation).toContain('cold start');
  });

  it.each([
    ['ECONNREFUSED', 'connection refused', 'Start the application'],
    ['ENOTFOUND', 'the host name could not be resolved', 'host name'],
    ['EAI_AGAIN', 'the host name could not be resolved', 'host name'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'the TLS certificate is not trusted', 'tlsInsecure'],
    ['CERT_HAS_EXPIRED', 'the TLS certificate is not trusted', 'tlsInsecure'],
    ['ETIMEDOUT', 'the connection attempt timed out', 'firewall'],
    ['UND_ERR_CONNECT_TIMEOUT', 'the connection attempt timed out', 'firewall'],
    ['ECONNRESET', 'the connection was reset', 'application logs'],
    ['ERR_INVALID_URL', 'the URL is not valid', 'absolute URL'],
  ])('explains %s', (code, reason, remediationHint) => {
    const failure = describeReachabilityFailure(fetchFailure(code), NOT_TIMED_OUT);

    expect(failure.reason).toBe(reason);
    expect(failure.remediation).toContain(remediationHint);
  });

  it('reads a code carried by the error itself when there is no cause', () => {
    const error = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });

    expect(describeReachabilityFailure(error, NOT_TIMED_OUT).reason).toBe('connection refused');
  });

  it('repeats an unknown but well-formed code', () => {
    expect(describeReachabilityFailure(fetchFailure('EPROTO'), NOT_TIMED_OUT).reason).toBe(
      'the request failed (EPROTO)',
    );
  });

  it('does not repeat a code that is not a plain error code', () => {
    const failure = describeReachabilityFailure(fetchFailure('see https://x.test/?token=abc'), NOT_TIMED_OUT);

    expect(failure.reason).toBe('the request failed');
  });

  it.each([
    ['an error without a code', new Error('network down')],
    ['a cause that is not an object', new Error('network down', { cause: 'text' })],
    ['a code that is not a string', Object.assign(new Error('x'), { code: 42 })],
    ['a value that is not an error', 'refused'],
    ['null', null],
  ])('gives a generic reason for %s', (_label, error) => {
    const failure = describeReachabilityFailure(error, NOT_TIMED_OUT);

    expect(failure.reason).toBe('the request failed');
    expect(failure.remediation).toContain('configured URL');
  });

  it('never repeats the message of the error it was given', () => {
    const failure = describeReachabilityFailure(
      new Error('connect failed for https://user:hunter2@host.test/?token=abc'),
      NOT_TIMED_OUT,
    );

    expect(`${failure.reason} ${failure.remediation}`).not.toMatch(/hunter2|token=abc/u);
  });
});

describe('redactUrlForDisplay', () => {
  it('keeps a plain URL as it is', () => {
    expect(redactUrlForDisplay('https://example.test/openapi.yaml')).toBe(
      'https://example.test/openapi.yaml',
    );
  });

  it('keeps the port', () => {
    expect(redactUrlForDisplay('http://localhost:8091/status')).toBe('http://localhost:8091/status');
  });

  it('drops credentials from the authority', () => {
    expect(redactUrlForDisplay('https://user:hunter2@example.test/spec')).toBe('https://example.test/spec');
  });

  it('hides query values and keeps the keys', () => {
    expect(redactUrlForDisplay('https://example.test/spec?token=abc&format=json')).toBe(
      'https://example.test/spec?token=[REDACTED]&format=[REDACTED]',
    );
  });

  it('keeps a key without a value, such as a document selector', () => {
    expect(redactUrlForDisplay('http://localhost:8091/docs?api-docs.json')).toBe(
      'http://localhost:8091/docs?api-docs.json',
    );
  });

  it('ignores empty pairs and drops the fragment', () => {
    expect(redactUrlForDisplay('https://example.test/spec?&a=1&#section')).toBe(
      'https://example.test/spec?a=[REDACTED]',
    );
  });

  it('does not echo a string that is not a URL', () => {
    expect(redactUrlForDisplay('not a url with secret=abc')).toBe('[invalid URL]');
  });
});
