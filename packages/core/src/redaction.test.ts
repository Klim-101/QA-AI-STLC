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

  it('redacts a password field in a URL-encoded request body (regression, #285)', () => {
    const input = har([
      { request: { postData: { mimeType: 'application/x-www-form-urlencoded', text: 'username=alice&password=hunter2' } } },
    ]);

    const result = redactHar(input);

    const parsed = JSON.parse(result.content) as {
      log: { entries: { request?: { postData?: { text?: string } } }[] };
    };
    expect(parsed.log.entries[0]?.request?.postData?.text).toBe('username=alice&password=[REDACTED]');
  });

  it('redacts a sensitive field in a JSON request body', () => {
    const input = har([
      { request: { postData: { mimeType: 'application/json', text: '{"username":"alice","password":"hunter2"}' } } },
    ]);

    const result = redactHar(input);

    const parsed = JSON.parse(result.content) as {
      log: { entries: { request?: { postData?: { text?: string } } }[] };
    };
    expect(JSON.parse(parsed.log.entries[0]?.request?.postData?.text ?? '{}')).toEqual({
      username: 'alice',
      password: '[REDACTED]',
    });
  });

  it('redacts a sensitive field in a nested JSON response body', () => {
    const input = har([
      { response: { content: { mimeType: 'application/json', text: '{"user":{"apiKey":"abc123"}}' } } },
    ]);

    const result = redactHar(input);

    const parsed = JSON.parse(result.content) as {
      log: { entries: { response?: { content?: { text?: string } } }[] };
    };
    expect(JSON.parse(parsed.log.entries[0]?.response?.content?.text ?? '{}')).toEqual({
      user: { apiKey: '[REDACTED]' },
    });
  });

  it('redacts a sensitive field inside an array in a JSON body', () => {
    const input = har([
      {
        request: {
          postData: {
            mimeType: 'application/json',
            text: '{"users":[{"name":"alice","password":"hunter2"},{"name":"bob","password":"hunter3"}]}',
          },
        },
      },
    ]);

    const result = redactHar(input);

    const parsed = JSON.parse(result.content) as {
      log: { entries: { request?: { postData?: { text?: string } } }[] };
    };
    expect(JSON.parse(parsed.log.entries[0]?.request?.postData?.text ?? '{}')).toEqual({
      users: [
        { name: 'alice', password: '[REDACTED]' },
        { name: 'bob', password: '[REDACTED]' },
      ],
    });
  });

  it('redacts a sensitive value in structured postData.params and leaves other params untouched', () => {
    const input = har([
      {
        request: {
          postData: {
            params: [
              { name: 'username', value: 'alice' },
              { name: 'password', value: 'hunter2' },
            ],
          },
        },
      },
    ]);

    const result = redactHar(input);

    const parsed = JSON.parse(result.content) as {
      log: { entries: { request?: { postData?: { params?: { name: string; value: string }[] } } }[] };
    };
    expect(parsed.log.entries[0]?.request?.postData?.params).toEqual([
      { name: 'username', value: 'alice' },
      { name: 'password', value: '[REDACTED]' },
    ]);
  });

  it('leaves a param with no name untouched', () => {
    const input = har([{ request: { postData: { params: [{ value: 'anything' }] } } }]);

    const result = redactHar(input);

    const parsed = JSON.parse(result.content) as {
      log: { entries: { request?: { postData?: { params?: { value: string }[] } } }[] };
    };
    expect(parsed.log.entries[0]?.request?.postData?.params?.[0]?.value).toBe('anything');
  });

  it('leaves a response content object with no text field untouched', () => {
    const input = har([{ response: { content: { mimeType: 'image/png' } } }]);

    const result = redactHar(input);

    const parsed = JSON.parse(result.content) as {
      log: { entries: { response?: { content?: { mimeType?: string } } }[] };
    };
    expect(parsed.log.entries[0]?.response?.content?.mimeType).toBe('image/png');
  });

  it('leaves a non-JSON, non-form body untouched', () => {
    const input = har([{ request: { postData: { text: 'plain text with no credentials' } } }]);

    const result = redactHar(input);

    const parsed = JSON.parse(result.content) as {
      log: { entries: { request?: { postData?: { text?: string } } }[] };
    };
    expect(parsed.log.entries[0]?.request?.postData?.text).toBe('plain text with no credentials');
  });

  it('leaves a request with postData but no text or params untouched', () => {
    const input = har([{ request: { postData: { mimeType: 'application/octet-stream' } } }]);

    const result = redactHar(input);

    const parsed = JSON.parse(result.content) as {
      log: { entries: { request?: { postData?: { mimeType?: string } } }[] };
    };
    expect(parsed.log.entries[0]?.request?.postData?.mimeType).toBe('application/octet-stream');
  });

  it('leaves an entry with no postData/content untouched', () => {
    const input = har([{ request: {}, response: {} }]);

    const result = redactHar(input);

    const parsed = JSON.parse(result.content) as {
      log: { entries: { request?: object; response?: object }[] };
    };
    expect(parsed.log.entries[0]?.request).toEqual({});
    expect(parsed.log.entries[0]?.response).toEqual({});
  });
});
