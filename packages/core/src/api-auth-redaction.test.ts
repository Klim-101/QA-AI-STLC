// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { redactHeaderValues, redactUrl, scrubSecretValues } from './api-auth-redaction.js';

const NAMES = { headers: ['X-Api-Key'], queryParameters: ['api_key'] };

describe('scrubSecretValues', () => {
  it('replaces a value wherever it occurs, verbatim or percent-encoded', () => {
    const text = 'a s3cret/x b s3cret%2Fx c';

    expect(scrubSecretValues(text, ['s3cret/x'])).toBe('a [REDACTED] b [REDACTED] c');
  });

  it('ignores empty values instead of inserting the placeholder everywhere', () => {
    expect(scrubSecretValues('abc', [''])).toBe('abc');
  });

  it('scrubs the longer of two overlapping secrets first', () => {
    expect(scrubSecretValues('tok-long', ['tok', 'tok-long'])).toBe('[REDACTED]');
  });
});

describe('redactHeaderValues', () => {
  it('redacts built-in and configured names case-insensitively and scrubs known values elsewhere', () => {
    const headers = redactHeaderValues(
      { 'Set-Cookie': 'sid=1', 'x-api-key': 'k', 'x-echo': 'value hunter22', 'content-type': 'text/plain' },
      NAMES,
      ['hunter22'],
    );

    expect(headers).toEqual({
      'Set-Cookie': '[REDACTED]',
      'x-api-key': '[REDACTED]',
      'x-echo': 'value [REDACTED]',
      'content-type': 'text/plain',
    });
  });
});

describe('redactUrl', () => {
  it('redacts a configured query parameter by name, leaving the rest and the fragment alone', () => {
    const url = 'https://h.test/p?a=1&API_KEY=abc&b&c=%20#frag';

    expect(redactUrl(url, NAMES, [])).toBe('https://h.test/p?a=1&API_KEY=[REDACTED]&b&c=%20#frag');
  });

  it('matches a percent-encoded parameter name and tolerates a malformed escape', () => {
    expect(redactUrl('https://h.test/?api%5Fkey=abc&%E0%A4=z', NAMES, [])).toBe(
      'https://h.test/?api%5Fkey=[REDACTED]&%E0%A4=z',
    );
  });

  it('scrubs known values from a URL that has no query or no configured names', () => {
    expect(redactUrl('https://h.test/tok123/x', NAMES, ['tok123'])).toBe('https://h.test/[REDACTED]/x');
    expect(redactUrl('https://h.test/?a=tok123', { headers: [], queryParameters: [] }, ['tok123'])).toBe(
      'https://h.test/?a=[REDACTED]',
    );
  });

  it('handles a query that runs to the end of the URL', () => {
    expect(redactUrl('https://h.test/?api_key=abc', NAMES, [])).toBe('https://h.test/?api_key=[REDACTED]');
  });
});
