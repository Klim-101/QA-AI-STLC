// Copyright The QA-AI-STLC Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { redactHar } from './redaction.js';

interface ParsedHarHeader {
  readonly name?: string;
  readonly value?: string;
}

interface ParsedHarMessage {
  readonly headers?: readonly ParsedHarHeader[];
  readonly cookies?: readonly { readonly value?: string }[];
}

interface ParsedHarEntry {
  readonly request?: ParsedHarMessage;
  readonly response?: ParsedHarMessage;
}

interface ParsedHar {
  readonly log: { readonly entries: readonly ParsedHarEntry[] };
}

function har(entries: unknown[]): string {
  return JSON.stringify({ log: { entries } });
}

function parseHar(content: string): ParsedHar {
  return JSON.parse(content) as ParsedHar;
}

describe('redactHar', () => {
  it('redacts an authorization request header', () => {
    const input = har([{ request: { headers: [{ name: 'Authorization', value: 'Bearer secret-token' }] } }]);

    const result = redactHar(input);

    expect(result.redacted).toBe(true);
    const parsed = parseHar(result.content);
    expect(parsed.log.entries[0]?.request?.headers?.[0]?.value).toBe('[REDACTED]');
  });

  it('redacts cookie and set-cookie headers, and response cookies', () => {
    const input = har([
      {
        request: { headers: [{ name: 'Cookie', value: 'session=abc123' }] },
        response: {
          headers: [{ name: 'Set-Cookie', value: 'session=abc123' }],
          cookies: [{ name: 'session', value: 'abc123' }],
        },
      },
    ]);

    const result = redactHar(input);

    const parsed = parseHar(result.content);
    expect(parsed.log.entries[0]?.request?.headers?.[0]?.value).toBe('[REDACTED]');
    expect(parsed.log.entries[0]?.response?.headers?.[0]?.value).toBe('[REDACTED]');
    expect(parsed.log.entries[0]?.response?.cookies?.[0]?.value).toBe('[REDACTED]');
  });

  it('leaves an entry with a request but no headers untouched', () => {
    const input = har([{ request: {} }]);

    const result = redactHar(input);

    expect(result.redacted).toBe(true);
    expect(parseHar(result.content).log.entries[0]?.request).toEqual({});
  });

  it('leaves a header with no name untouched', () => {
    const input = har([{ request: { headers: [{ value: 'anything' }] } }]);

    const result = redactHar(input);

    expect(parseHar(result.content).log.entries[0]?.request?.headers?.[0]?.value).toBe('anything');
  });

  it('leaves non-sensitive headers untouched', () => {
    const input = har([{ request: { headers: [{ name: 'Content-Type', value: 'application/json' }] } }]);

    const result = redactHar(input);

    const parsed = parseHar(result.content);
    expect(parsed.log.entries[0]?.request?.headers?.[0]?.value).toBe('application/json');
  });

  it('returns malformed JSON unchanged and not marked as redacted', () => {
    const result = redactHar('not json');
    expect(result).toEqual({ content: 'not json', redacted: false });
  });

  it('returns valid JSON that is not a HAR document unchanged', () => {
    const result = redactHar('{"hello":"world"}');
    expect(result).toEqual({ content: '{"hello":"world"}', redacted: false });
  });

  it('handles an entry with no request or response', () => {
    const input = har([{}]);
    const result = redactHar(input);
    expect(result.redacted).toBe(true);
    expect(parseHar(result.content).log.entries[0]).toEqual({ request: undefined, response: undefined });
  });
});
